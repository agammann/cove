import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { database } from "../packages/database/db.js";
import { buildServer } from "../apps/api/server.js";
import { readConfig } from "../apps/api/config.js";
import { emptyContext } from "../packages/shared/context.js";
import type { Actor } from "../packages/domain/service.js";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
process.loadEnvFile(".env");
const origin = "http://localhost:3091";
const dbName = `cove_test_${Date.now()}`;
const base = new URL(process.env.DATABASE_URL!);
const admin = new Pool({ connectionString: base.href });
base.pathname = `/${dbName}`;
let env: Awaited<ReturnType<typeof buildServer>>;
let a: Actor, b: Actor;
let cookie: string;
const body = (value: unknown) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    origin,
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify(value),
});
async function call(path: string, init?: RequestInit) {
  const r = await fetch(`${origin}${path}`, init);
  const text = await r.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { r, data };
}
async function account(name: string) {
  const email = `cove-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}!`;
  const { data, r } = await call(
    "/api/auth/sign-up/email",
    body({ name, email, password }),
  );
  expect(r.status).toBe(200);
  await env.pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
    data.user.id,
  ]);
  return { id: data.user.id, email, password };
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${dbName}`);
  const d = database(base.href);
  await migrate(d.db, { migrationsFolder: "packages/database/migrations" });
  await d.pool.end();
  env = await buildServer(
    readConfig({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3091",
      APP_URL: origin,
      DATABASE_URL: base.href,
      RATE_LIMIT: "10000",
    }),
  );
  await env.app.listen({ port: 3091, host: "127.0.0.1" });
  const u = await account("Fixture owner A");
  const v = await account("Fixture owner B");
  a = { userId: u.id };
  b = { userId: v.id };
  const login = await call(
    "/api/auth/sign-in/email",
    body({ email: u.email, password: u.password }),
  );
  expect(login.r.status).toBe(200);
  cookie = login.r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
});
afterAll(async () => {
  if (env) await env.app.close();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
describe("real PostgreSQL transactions and isolation", () => {
  it("returns only public numeric quotas from the authenticated usage endpoint", async () => {
    const { r, data } = await call("/api/usage", { headers: { cookie } });
    expect(r.status).toBe(200);
    expect(Object.keys(data.limits).sort()).toEqual([
      "MAX_PROJECTS",
      "MAX_REVISIONS",
      "MAX_STORAGE_BYTES",
    ]);
    expect(Object.values(data.limits).every((v) => typeof v === "number")).toBe(
      true,
    );
    const serialized = JSON.stringify(data);
    expect(
      ["BETTER_AUTH_SECRET", "DATABASE_URL", "SMTP_PASSWORD", "SMTP_USER"].some(
        (k) => serialized.includes(k),
      ),
    ).toBe(false);
  });
  it("rejects account and historical/search leakage, including a direct handoff ID", async () => {
    const p = await env.service.createProject(a, {
      name: "Secret pelagic project",
      context: { ...emptyContext(), goal: "pelagic private" },
    });
    const h = await env.service.createHandoff(a, p.id, {
      expectedVersion: 1,
      requestKey: randomUUID(),
    });
    await expect(env.service.context(b, p.id)).rejects.toMatchObject({
      code: "PROJECT_UNAVAILABLE",
    });
    await expect(env.service.context(b, p.id, 1)).rejects.toMatchObject({
      code: "PROJECT_UNAVAILABLE",
    });
    await expect(env.service.handoff(b, p.id, h.id)).rejects.toMatchObject({
      code: "PROJECT_UNAVAILABLE",
    });
    expect((await env.service.search(b, "pelagic")).items).toHaveLength(0);
    expect((await env.service.search(a, "pelagic")).items).toHaveLength(1);
  });
  it("serializes concurrent writes and retries without duplicate revisions", async () => {
    const p = await env.service.createProject(a, { name: "Concurrency" });
    const one = {
      context: { ...emptyContext(), goal: "first" },
      expectedVersion: 1,
      summary: "first",
      requestKey: randomUUID(),
    };
    const two = {
      ...one,
      context: { ...emptyContext(), goal: "second" },
      requestKey: randomUUID(),
    };
    const results = await Promise.allSettled([
      env.service.update(a, p.id, one),
      env.service.update(a, p.id, two),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "VERSION_CONFLICT" },
    });
    const winner = results[0].status === "fulfilled" ? one : two;
    expect(await env.service.update(a, p.id, winner)).toMatchObject({
      version: 2,
    });
    await expect(
      env.service.update(a, p.id, { ...winner, summary: "changed payload" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    const dupe = { ...winner, expectedVersion: 2, requestKey: randomUUID() };
    const both = await Promise.all([
      env.service.update(a, p.id, dupe),
      env.service.update(a, p.id, dupe),
    ]);
    expect(both[0]).toEqual(both[1]);
    expect(
      (await env.service.listRecords(a, p.id, "revisions")).items,
    ).toHaveLength(3);
  });
  it("pins immutable handoffs, detects newer work, and restores as a new revision", async () => {
    const p = await env.service.createProject(a, {
      name: "Snapshots",
      context: { ...emptyContext(), goal: "original" },
    });
    const h = await env.service.createHandoff(a, p.id, {
      expectedVersion: 1,
      requestKey: randomUUID(),
    });
    await env.service.update(a, p.id, {
      context: { ...emptyContext(), goal: "new" },
      expectedVersion: 1,
      summary: "new",
      requestKey: randomUUID(),
    });
    await expect(
      env.service.createHandoff(a, p.id, {
        expectedVersion: 1,
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const got = await env.service.handoff(a, p.id, h.id);
    expect(got.snapshot.context.goal).toBe("original");
    expect(got.hasNewerChanges).toBe(true);
    expect(got.currentVersion).toBe(2);
    await expect(
      env.pool.query("UPDATE handoffs SET version=2 WHERE id=$1", [h.id]),
    ).rejects.toThrow("immutable");
    await expect(
      env.pool.query("UPDATE revisions SET summary=$1 WHERE project_id=$2", [
        "bad",
        p.id,
      ]),
    ).rejects.toThrow("immutable");
    expect(
      await env.service.restore(a, p.id, 1, 2, randomUUID()),
    ).toMatchObject({ version: 3 });
    expect((await env.service.context(a, p.id)).revision.context!.goal).toBe(
      "original",
    );
  });
  it("enforces read-only grants, cross-project FK integrity, expiration and replay authorization", async () => {
    const p = await env.service.createProject(a, { name: "Grant A" });
    const other = await env.service.createProject(b, { name: "Grant B" });
    const c = await env.service.saveConnection(a, {
      clientId: randomUUID(),
      label: "Read only",
      grants: [{ projectId: p.id, capabilities: ["read"] }],
    });
    const ca = { ...a, connectionId: c.id };
    expect((await env.service.context(ca, p.id)).project.id).toBe(p.id);
    await expect(
      env.service.update(ca, p.id, {
        context: emptyContext(),
        expectedVersion: 1,
        summary: "x",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      env.service.handoff(ca, other.id, randomUUID()),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      env.pool.query(
        "INSERT INTO grants(connection_id,project_id,capabilities) VALUES($1,$2,$3)",
        [c.id, other.id, '["read"]'],
      ),
    ).rejects.toThrow("owner mismatch");
    await env.service.revoke(a, c.id);
    await expect(env.service.context(ca, p.id)).rejects.toMatchObject({
      code: "CONNECTION_REVOKED",
    });
    await expect(env.service.listProjects(ca)).rejects.toMatchObject({
      code: "CONNECTION_REVOKED",
    });
  });
  it("imports isolated history with remapped IDs and deletes the complete project graph", async () => {
    const p = await env.service.createProject(a, {
      name: "Portable",
      context: {
        ...emptyContext(),
        notes: [
          {
            id: randomUUID(),
            text: "Keep this note",
            kind: "decision",
            sourceIds: [],
          },
        ],
      },
    });
    await env.service.createHandoff(a, p.id, {
      expectedVersion: 1,
      requestKey: randomUUID(),
    });
    const ex = await env.service.export(a, p.id);
    const copy = await env.service.import(b, ex);
    expect(copy.id).not.toBe(p.id);
    const ex2 = await env.service.export(b, copy.id);
    expect(ex2.revisions[0].context.notes[0].id).not.toBe(
      ex.revisions[0].context.notes[0].id,
    );
    expect(ex2.revisions[0].author).toMatch(/^Imported:/);
    expect(ex2.handoffs[0].id).not.toBe(ex.handoffs[0].id);
    expect(await env.service.listConnections(b)).toHaveLength(0);
    await env.service.deleteProject(b, copy.id, "Portable");
    for (const table of [
      "revisions",
      "handoffs",
      "events",
      "idempotency",
      "grants",
      "measurements",
    ])
      expect(
        (
          await env.pool.query(`SELECT * FROM ${table} WHERE project_id=$1`, [
            copy.id,
          ])
        ).rowCount,
      ).toBe(0);
    expect((await env.service.context(a, p.id)).project.id).toBe(p.id);
  });
  it("denies CSRF, bad hosts, malformed imports, oversized requests and unauthenticated MCP", async () => {
    expect(
      (
        await call("/api/projects", {
          ...body({ name: "no origin" }),
          headers: { cookie, "Content-Type": "application/json" },
        })
      ).r.status,
    ).toBe(403);
    expect(
      (
        await call("/api/projects", {
          headers: { cookie, origin: "https://evil.example" },
        })
      ).r.status,
    ).toBe(403);
    const bad = await env.app.inject({
      method: "GET",
      url: "/health/live",
      headers: { host: "evil.example" },
    });
    expect(bad.statusCode).toBe(400);
    expect(
      (await call("/api/import", body({ schemaVersion: 1, grants: [] }))).r
        .status,
    ).toBe(400);
    expect(
      (await call("/api/projects", body({ name: "x".repeat(140000) }))).r
        .status,
    ).toBe(413);
    const m = await call("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(m.r.status).toBe(401);
    expect(m.r.headers.get("www-authenticate")).toContain("resource_metadata");
    expect(
      (await call("/.well-known/oauth-protected-resource/mcp")).data.resource,
    ).toBe(`${origin}/mcp`);
  });
  it("exchanges work through two independently authenticated OAuth SDK clients, then revokes a live connection", async () => {
    const p = await env.service.createProject(a, { name: "SDK acceptance" });
    async function authorize(label: string) {
      const registered = await call("/api/auth/oauth2/register", {
        ...body({
          client_name: label,
          application_type: "native",
          redirect_uris: ["http://127.0.0.1:3999/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          scope: "cove offline_access",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(registered.r.status, JSON.stringify(registered.data)).toBe(201);
      const cid = registered.data.client_id;
      const c = await env.service.saveConnection(a, {
        clientId: cid,
        label,
        grants: [
          { projectId: p.id, capabilities: ["read", "write", "handoff"] },
        ],
      });
      const verifier = randomBytes(48).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const query = new URLSearchParams({
        client_id: cid,
        redirect_uri: "http://127.0.0.1:3999/callback",
        response_type: "code",
        scope: "cove offline_access",
        resource: `${origin}/mcp`,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: randomUUID(),
      });
      const ar = await fetch(`${origin}/api/auth/oauth2/authorize?${query}`, {
        headers: { cookie, accept: "text/html" },
        redirect: "manual",
      });
      const arText = await ar.text();
      const location =
        ar.headers.get("location") || (arText ? JSON.parse(arText).url : null);
      expect(location).toBeTruthy();
      const consentUrl = new URL(location!, origin);
      const consent = await call(
        "/api/auth/oauth2/consent",
        body({
          accept: true,
          oauth_query:
            consentUrl.searchParams.get("oauth_query") ||
            consentUrl.searchParams.toString(),
        }),
      );
      expect(consent.r.status, JSON.stringify(consent.data)).toBe(200);
      const redir = new URL(consent.data.url || consent.data.redirect_uri);
      const tokenResponse = await call("/api/auth/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: cid,
          code: redir.searchParams.get("code")!,
          redirect_uri: "http://127.0.0.1:3999/callback",
          code_verifier: verifier,
          resource: `${origin}/mcp`,
        }),
      });
      expect(tokenResponse.r.status, JSON.stringify(tokenResponse.data)).toBe(
        200,
      );
      const client = new Client({ name: label, version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`${origin}/mcp`),
        {
          requestInit: {
            headers: {
              Authorization: `Bearer ${tokenResponse.data.access_token}`,
            },
          },
        },
      );
      await client.connect(transport);
      return {
        client,
        connection: c,
        token: tokenResponse.data.access_token,
        cid,
      };
    }
    const first = await authorize("SDK fixture A");
    const second = await authorize("SDK fixture B");
    try {
      expect(first.token).not.toBe(second.token);
      expect((await first.client.listTools()).tools).toHaveLength(7);
      const read = await first.client.callTool({
        name: "cove_get_context",
        arguments: { projectId: p.id, detail: "full" },
      });
      expect(read.isError).not.toBe(true);
      const update = await first.client.callTool({
        name: "cove_update_context",
        arguments: {
          projectId: p.id,
          context: { ...emptyContext(), goal: "SDK goal" },
          expectedVersion: 1,
          summary: "A saved",
          requestKey: randomUUID(),
        },
      });
      expect(update.isError, JSON.stringify(update)).not.toBe(true);
      const h = await first.client.callTool({
        name: "cove_create_handoff",
        arguments: {
          projectId: p.id,
          expectedVersion: 2,
          requestKey: randomUUID(),
        },
      });
      const hid = (h.structuredContent as any).id;
      expect(hid).toBeTruthy();
      const got = await second.client.callTool({
        name: "cove_get_handoff",
        arguments: { projectId: p.id, handoffId: hid },
      });
      expect((got.structuredContent as any).snapshot.context.goal).toBe(
        "SDK goal",
      );
      const continued = await second.client.callTool({
        name: "cove_update_context",
        arguments: {
          projectId: p.id,
          context: { ...emptyContext(), goal: "SDK continued" },
          expectedVersion: 2,
          summary: "B saved",
          requestKey: randomUUID(),
        },
      });
      expect((continued.structuredContent as any).version).toBe(3);
      const stale = await first.client.callTool({
        name: "cove_update_context",
        arguments: {
          projectId: p.id,
          context: emptyContext(),
          expectedVersion: 2,
          summary: "stale",
          requestKey: randomUUID(),
        },
      });
      expect(stale.isError).toBe(true);
      expect((stale.structuredContent as any).error.code).toBe(
        "VERSION_CONFLICT",
      );
      await env.service.revoke(a, first.connection.id);
      await expect(first.client.listTools()).rejects.toThrow();
      expect((await second.client.listTools()).tools).toHaveLength(7);
    } finally {
      await first.client.close();
      await second.client.close();
    }
  });
});
