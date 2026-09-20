import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { TestDatabase } from "./sites-database.js";
import { SitesService } from "../apps/sites/service.js";
import worker from "../apps/sites/worker.js";
import { emptyContext } from "../packages/shared/context.js";
import type { Environment } from "../apps/sites/types.js";
let db: TestDatabase,
  service: SitesService,
  env: Environment,
  cookie: string,
  actor: { userId: string };
const origin = "http://localhost:4318";
afterEach(() => vi.unstubAllGlobals());
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  extra: Record<string, string> = {},
) {
  const response = await worker.fetch(
    new Request(origin + path, {
      method,
      headers: {
        cookie,
        origin,
        ...(data ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    env,
  );
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}
beforeEach(async () => {
  db = new TestDatabase();
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.sql.exec(readFileSync("drizzle/" + f, "utf8"));
  service = new SitesService(db);
  env = {
    DB: db,
    APP_URL: origin,
    BETTER_AUTH_SECRET: "test-only-0123456789012345678901234567890",
    ASSETS: { fetch: async () => new Response("test frontend") },
  };
  const res = await worker.fetch(
    new Request(origin + "/api/auth/chatgpt", {
      headers: {
        "oai-authenticated-user-id": "fixture-alice",
        "oai-authenticated-user-email": "alice@example.test",
      },
    }),
    env,
  );
  expect(res.status, await res.clone().text()).toBe(302);
  cookie = res.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  const me = await call("/api/me");
  expect(me.response.status, JSON.stringify(me.data)).toBe(200);
  actor = { userId: me.data.id };
});
it("maps Sites identity consistently and rejects anonymous, CSRF, invalid hosts and oversized input", async () => {
  const again = await worker.fetch(
    new Request(origin + "/api/auth/chatgpt", {
      headers: {
        "oai-authenticated-user-id": "fixture-alice",
        "oai-authenticated-user-email": "alice@example.test",
      },
    }),
    env,
  );
  expect(again.status).toBe(302);
  expect(db.sql.prepare("SELECT count(*) n FROM user").get()?.n).toBe(1);
  const anon = await worker.fetch(
    new Request(origin + "/api/auth/chatgpt"),
    env,
  );
  expect(anon.status).toBe(401);
  expect(
    (
      await call(
        "/api/projects",
        "POST",
        { name: "bad" },
        { origin: "https://evil.test" },
      )
    ).response.status,
  ).toBe(403);
  expect(
    (await worker.fetch(new Request("http://evil.test/api/me"), env)).status,
  ).toBe(400);
  expect(
    (await call("/api/projects", "POST", { name: "x".repeat(140000) })).response
      .status,
  ).toBe(413);
  expect(
    (await call("/api/mcp", "POST", {}, { cookie: "" })).response.status,
  ).toBe(401);
  expect(
    (await call("/.well-known/oauth-protected-resource/api/mcp")).data.resource,
  ).toBe(origin + "/api/mcp");
});
it("persists revisions, deduplicates concurrent writes, preserves handoffs and restores as a new revision", async () => {
  const p = await service.createProject(actor, { name: "Research notebook" });
  const v = {
    context: { ...emptyContext(), goal: "Research goal" },
    expectedVersion: 1,
    summary: "Saved",
    requestKey: randomUUID(),
  };
  const results = await Promise.all([
    service.update(actor, p.id, v),
    service.update(actor, p.id, v),
  ]);
  expect(results[0]).toEqual(results[1]);
  await expect(
    service.update(actor, p.id, { ...v, summary: "different" }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  const h = await service.createHandoff(actor, p.id, {
    expectedVersion: 2,
    requestKey: randomUUID(),
  });
  await service.update(actor, p.id, {
    ...v,
    context: { ...v.context, goal: "Changed" },
    expectedVersion: 2,
    requestKey: randomUUID(),
  });
  const old = await service.handoff(actor, p.id, h.id);
  expect(old.snapshot.context.goal).toBe("Research goal");
  expect(old.hasNewerChanges).toBe(true);
  await expect(
    service.update(actor, p.id, { ...v, requestKey: randomUUID() }),
  ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect((await service.restore(actor, p.id, 2, 3, randomUUID())).version).toBe(
    4,
  );
  expect(
    (await service.compare(actor, p.id, 2, 3)).changes.length,
  ).toBeGreaterThan(0);
});
it("isolates accounts and enforces grants, revocation and private search on every operation", async () => {
  const p = await service.createProject(actor, {
    name: "Unique secret project",
  });
  await db
    .prepare("INSERT INTO site_owners(id,name) VALUES(?,?)")
    .bind("bob", "Bob")
    .run();
  await expect(service.context({ userId: "bob" }, p.id)).rejects.toMatchObject({
    code: "PROJECT_UNAVAILABLE",
  });
  expect(
    (await service.search({ userId: "bob" }, "Unique")).items,
  ).toHaveLength(0);
  const c = await service.saveConnection(actor, {
    clientId: "fixture-client",
    label: "Reader",
    grants: [{ projectId: p.id, capabilities: ["read"] }],
  });
  const a = await service.connectionActor(actor.userId, "fixture-client");
  expect((await service.context(a, p.id)).project.id).toBe(p.id);
  await expect(
    service.update(a, p.id, {
      context: emptyContext(),
      expectedVersion: 1,
      summary: "bad",
      requestKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "PROJECT_UNAVAILABLE" });
  await service.revoke(actor, c.id);
  await expect(service.context(a, p.id)).rejects.toMatchObject({
    code: "CONNECTION_REVOKED",
  });
  await expect(service.listProjects(a)).rejects.toMatchObject({
    code: "CONNECTION_REVOKED",
  });
});
it("imports new private IDs and deletes account content and sessions", async () => {
  const p = await service.createProject(actor, {
    name: "Portable",
    context: { ...emptyContext(), goal: "Keep this" },
  });
  await service.createHandoff(actor, p.id, {
    expectedVersion: 1,
    requestKey: randomUUID(),
  });
  const exported = await service.export(actor, p.id);
  const imported = await service.import(actor, exported);
  expect(imported.id).not.toBe(p.id);
  expect(
    (await service.context(actor, imported.id)).revision.context.goal,
  ).toBe("Keep this");
  expect((await service.usage(actor)).limits).toEqual({
    MAX_PROJECTS: 50,
    MAX_REVISIONS: 1000,
    MAX_STORAGE_BYTES: 104857600,
  });
  await service.deleteProject(actor, p.id, "Portable");
  await expect(service.context(actor, p.id)).rejects.toThrow();
  await service.deleteAccount(actor);
  expect((await call("/api/me")).response.status).toBe(401);
  expect(db.sql.prepare("SELECT count(*) n FROM site_records").get()?.n).toBe(
    0,
  );
});
it("preserves connection expiration on permission edits and renews only on request", async () => {
  const p = await service.createProject(actor, { name: "Expiration" });
  const input = {
    clientId: "expiration-fixture",
    label: "Short access",
    grants: [{ projectId: p.id, capabilities: ["read"] }],
  };
  const created = await call("/api/connections", "POST", {
    ...input,
    expiresInDays: 7,
  });
  expect(created.response.status).toBe(200);
  const expiry = async () =>
    (await service.listConnections(actor)).find(
      (c) => c.id === created.data.id,
    )!.expires_at;
  const original = await expiry();
  expect(
    (
      await call("/api/connections", "POST", {
        ...input,
        label: "Edited permissions",
      })
    ).response.status,
  ).toBe(200);
  expect(await expiry()).toBe(original);
  await call("/api/connections", "POST", { ...input, expiresInDays: 90 });
  expect(new Date(await expiry()).getTime()).toBeGreaterThan(
    new Date(original).getTime(),
  );
  const past = "2020-01-01T00:00:00.000Z";
  db.sql
    .prepare("UPDATE site_connections SET expires_at=? WHERE id=?")
    .run(past, created.data.id);
  await call("/api/connections", "POST", { ...input, label: "Still expired" });
  expect(await expiry()).toBe(past);
  await expect(
    service.connectionActor(actor.userId, input.clientId),
  ).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });
});
it("completes OAuth PKCE with two SDK clients and enforces live revocation", async () => {
  vi.stubGlobal("fetch", async (url: any, init?: RequestInit) =>
    worker.fetch(new Request(url, init), env),
  );
  const { Client, StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/client");
  const { randomBytes, createHash } = await import("node:crypto");
  const p = await service.createProject(actor, { name: "MCP hosted fixture" });
  const invoke = async (path: string, init: RequestInit = {}) =>
    worker.fetch(new Request(origin + path, init), env);
  async function authorize(label: string) {
    const reg = await call(
      "/api/auth/oauth2/register",
      "POST",
      {
        client_name: label,
        application_type: "native",
        redirect_uris: ["http://127.0.0.1:3999/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "cove offline_access",
      },
      { cookie: "" },
    );
    expect(reg.response.status, JSON.stringify(reg.data)).toBe(201);
    const cid = reg.data.client_id;
    const connection = await service.saveConnection(actor, {
      clientId: cid,
      label,
      grants: [{ projectId: p.id, capabilities: ["read", "write", "handoff"] }],
    });
    const verifier = randomBytes(48).toString("base64url");
    const query = new URLSearchParams({
      client_id: cid,
      redirect_uri: "http://127.0.0.1:3999/callback",
      response_type: "code",
      scope: "cove offline_access",
      resource: origin + "/api/mcp",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: randomUUID(),
    });
    const ar = await invoke("/api/auth/oauth2/authorize?" + query, {
      headers: { cookie, accept: "text/html" },
    });
    expect(ar.status, await ar.clone().text()).toBe(302);
    const u = new URL(ar.headers.get("location")!, origin);
    const consent = await call("/api/auth/oauth2/consent", "POST", {
      accept: true,
      oauth_query:
        u.searchParams.get("oauth_query") || u.searchParams.toString(),
    });
    expect(consent.response.status, JSON.stringify(consent.data)).toBe(200);
    const redirect = new URL(consent.data.url || consent.data.redirect_uri);
    const token = await invoke("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cid,
        code: redirect.searchParams.get("code")!,
        redirect_uri: "http://127.0.0.1:3999/callback",
        code_verifier: verifier,
        resource: origin + "/api/mcp",
      }),
    });
    const credentials: any = await token.json();
    expect(token.status, JSON.stringify(credentials)).toBe(200);
    const client = new Client({ name: label, version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(origin + "/api/mcp"),
      {
        fetch: async (url, init) => worker.fetch(new Request(url, init), env),
        requestInit: {
          headers: { Authorization: "Bearer " + credentials.access_token },
        },
      },
    );
    await client.connect(transport);
    return { client, connection };
  }
  const one = await authorize("Fixture A"),
    two = await authorize("Fixture B");
  try {
    expect((await one.client.listTools()).tools.length).toBe(7);
    const updated = await one.client.callTool({
      name: "cove_update_context",
      arguments: {
        projectId: p.id,
        context: { ...emptyContext(), goal: "Across assistants" },
        expectedVersion: 1,
        summary: "A saved",
        requestKey: randomUUID(),
      },
    });
    expect(updated.isError, JSON.stringify(updated)).not.toBe(true);
    const handoff = await one.client.callTool({
      name: "cove_create_handoff",
      arguments: {
        projectId: p.id,
        expectedVersion: 2,
        requestKey: randomUUID(),
      },
    });
    const id = (handoff.structuredContent as any).id;
    const got = await two.client.callTool({
      name: "cove_get_handoff",
      arguments: { projectId: p.id, handoffId: id },
    });
    expect((got.structuredContent as any).snapshot.context.goal).toBe(
      "Across assistants",
    );
    await service.revoke(actor, one.connection.id);
    await expect(one.client.listTools()).rejects.toThrow();
    expect((await two.client.listTools()).tools.length).toBe(7);
  } finally {
    await one.client.close();
    await two.client.close();
  }
});
