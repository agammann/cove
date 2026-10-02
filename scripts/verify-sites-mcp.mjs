import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { URL, URLSearchParams } from "node:url";
import assert from "node:assert/strict";
const { fetch } = globalThis;
const base = "http://localhost:4318";
await mkdir("test-results", { recursive: true });
const auth = await fetch(base + "/api/auth/chatgpt", {
  headers: {
    "oai-authenticated-user-id": "mcp-review-" + randomUUID(),
    "oai-authenticated-user-email": "mcp-" + randomUUID() + "@example.test",
  },
  redirect: "manual",
});
assert.equal(auth.status, 302);
const cookie = auth.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
const api = async (path, method = "GET", data) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      cookie,
      origin: base,
      ...(data ? { "content-type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await r.json();
  assert(r.ok, JSON.stringify({ status: r.status, value }));
  return value;
};
const project = await api("/api/projects", "POST", {
  name: "Fictional MCP acceptance",
});
const clients = [],
  checks = [];
let failure;
async function authorize(label, capabilities = ["read", "write", "handoff"]) {
  const registration = await fetch(base + "/api/auth/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: label,
      application_type: "native",
      redirect_uris: ["http://127.0.0.1:3999/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "cove offline_access",
    }),
  });
  assert.equal(registration.status, 201);
  const cid = (await registration.json()).client_id;
  const connection = await api("/api/connections", "POST", {
    clientId: cid,
    label,
    grants: [{ projectId: project.id, capabilities }],
  });
  const verifier = randomBytes(48).toString("base64url");
  const query = new URLSearchParams({
    client_id: cid,
    redirect_uri: "http://127.0.0.1:3999/callback",
    response_type: "code",
    scope: "cove offline_access",
    resource: base + "/api/mcp",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: randomUUID(),
  });
  const authorization = await fetch(
    base + "/api/auth/oauth2/authorize?" + query,
    { headers: { cookie, accept: "text/html" }, redirect: "manual" },
  );
  assert.equal(authorization.status, 302);
  const location = new URL(authorization.headers.get("location"), base);
  const consent = await api("/api/auth/oauth2/consent", "POST", {
    accept: true,
    oauth_query:
      location.searchParams.get("oauth_query") ||
      location.searchParams.toString(),
  });
  const callback = new URL(consent.url || consent.redirect_uri);
  const token = await fetch(base + "/api/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cid,
      code: callback.searchParams.get("code"),
      redirect_uri: "http://127.0.0.1:3999/callback",
      code_verifier: verifier,
      resource: base + "/api/mcp",
    }),
  });
  assert.equal(token.status, 200);
  const credentials = await token.json();
  const client = new Client({ name: label, version: "1.0.0" });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(base + "/api/mcp"), {
      requestInit: {
        headers: { Authorization: "Bearer " + credentials.access_token },
      },
    }),
  );
  return { client, connection };
}
try {
  const one = await authorize("Fictional review A"),
    two = await authorize("Fictional review B", ["read"]);
  assert.equal((await one.client.listTools()).tools.length, 7);
  checks.push(
    "Two actual HTTP SDK clients complete S256 OAuth with separate project grants",
  );
  const context = {
    goal: "Across assistants",
    summary: "Fictional protocol check",
    constraints: [],
    decisions: [],
    notes: [],
    completedWork: [],
    nextSteps: [],
    openQuestions: [],
    sources: [],
    artifacts: [],
  };
  const update = await one.client.callTool({
    name: "cove_update_context",
    arguments: {
      projectId: project.id,
      context,
      expectedVersion: 1,
      summary: "Fictional revision",
      requestKey: randomUUID(),
    },
  });
  assert(!update.isError, JSON.stringify(update));
  const handoff = await one.client.callTool({
    name: "cove_create_handoff",
    arguments: {
      projectId: project.id,
      expectedVersion: 2,
      requestKey: randomUUID(),
    },
  });
  assert(!handoff.isError, JSON.stringify(handoff));
  const received = await two.client.callTool({
    name: "cove_get_handoff",
    arguments: {
      projectId: project.id,
      handoffId: handoff.structuredContent.id,
    },
  });
  assert.equal(received.structuredContent.snapshot.context.goal, context.goal);
  checks.push(
    "Actual MCP save, handoff and independent client retrieval preserve the saved revision",
  );
  const retrieved = await two.client.callTool({
    name: "cove_get_context",
    arguments: { projectId: project.id, detail: "full" },
  });
  assert.equal(retrieved.structuredContent.revision.context.goal, context.goal);
  for (const call of [
    { name: "cove_list_projects", arguments: {} },
    { name: "cove_search", arguments: { query: context.goal } },
    {
      name: "cove_get_changes",
      arguments: { projectId: project.id, from: 1, to: 2 },
    },
  ]) {
    const result = await two.client.callTool(call);
    assert(!result.isError, JSON.stringify(result));
    assert(
      JSON.stringify(result.structuredContent).includes(
        call.name === "cove_get_changes" ? context.goal : project.id,
      ),
      `${call.name}: ${JSON.stringify(result.structuredContent)}`,
    );
  }
  checks.push(
    "All seven advertised tools return the expected project, source revision, search and change data over HTTP",
  );
  const denied = await two.client.callTool({
    name: "cove_update_context",
    arguments: {
      projectId: project.id,
      context,
      expectedVersion: 2,
      summary: "Forbidden write",
      requestKey: randomUUID(),
    },
  });
  assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent.error.code, "PROJECT_UNAVAILABLE");
  const unchanged = await two.client.callTool({
    name: "cove_get_context",
    arguments: { projectId: project.id, detail: "full" },
  });
  assert.equal(unchanged.structuredContent.project.version, 2);
  checks.push("A read-only OAuth client cannot mutate the saved context");
  await api("/api/connections/" + one.connection.id + "/revoke", "POST", {});
  await assert.rejects(() => one.client.listTools());
  assert.equal((await two.client.listTools()).tools.length, 7);
  checks.push(
    "Revoking a live connection rejects further calls while the other client remains authorized",
  );
} catch (e) {
  failure = e.stack;
  process.exitCode = 1;
  console.error(e.message);
} finally {
  for (const client of clients) await client.close();
  await api("/api/account", "DELETE", { confirmation: "DELETE MY ACCOUNT" });
  await writeFile(
    "test-results/cove-sites-mcp.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        runtime: "compiled Worker and real local D1 over HTTP",
        sdk: "2.0.0",
        signIn: "synthetic local identity",
        checks,
        failure,
      },
      null,
      2,
    ),
  );
  console.log(checks.join("\n"));
}
