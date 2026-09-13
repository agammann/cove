import { z } from "zod";
import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { makeServer } from "../../packages/mcp/server.js";
import { DomainError, type Actor } from "../../packages/domain/service.js";
import { pageSchema, formatHandoff } from "../../packages/shared/context.js";
import { SitesService } from "./service.js";
import { sitesAuth } from "./auth.js";
import type { Environment } from "./types.js";
const json = (v: unknown, status = 200) => Response.json(v, { status });
async function body(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new DomainError("PAYLOAD_LIMIT", "Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    bytes += r.value.length;
    if (bytes > limit) {
      await reader.cancel();
      throw new DomainError("PAYLOAD_LIMIT", "Request is too large.", 413);
    }
    chunks.push(r.value);
  }
  const out = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  const text = new TextDecoder().decode(out);
  return request.headers
    .get("content-type")
    ?.includes("application/x-www-form-urlencoded")
    ? Object.fromEntries(new URLSearchParams(text))
    : JSON.parse(text || "{}");
}
export async function route(
  request: Request,
  env: Environment,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method,
    origin = env.APP_URL;
  if (url.origin !== origin)
    throw new DomainError("INVALID_HOST", "Unrecognized host.", 400);
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    throw new DomainError("INVALID_ORIGIN", "Origin is not permitted.", 403);
  if (path === "/api/runtime")
    return json({ authMode: "chatgpt", storage: "hosted" });
  const service = new SitesService(env.DB);
  if (path === "/health/live") return json({ status: "ok" });
  if (path === "/health/ready") {
    await env.DB.prepare("SELECT id FROM site_projects LIMIT 1").all();
    return json({ status: "ready" });
  }
  if (
    !path.startsWith("/api/") &&
    !path.startsWith("/.well-known/") &&
    path !== "/mcp"
  ) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || !["GET", "HEAD"].includes(method) || /\.[a-z0-9]+$/i.test(path)) return asset;
    return env.ASSETS.fetch(new Request(new URL("/index.html", origin), { method, headers: request.headers }));
  }
  const auth = sitesAuth(env);
  let input: any = {};
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    input = await body(request, path === "/api/import" ? 8388608 : 131072);
    request = new Request(request.url, {
      method,
      headers: request.headers,
      body: request.headers
        .get("content-type")
        ?.includes("application/x-www-form-urlencoded")
        ? new URLSearchParams(input).toString()
        : JSON.stringify(input),
    });
  }
  if (path.startsWith("/api/auth/") || path.startsWith("/.well-known/")) {
    let response = await auth.handler(request);
    if (
      response.status === 200 &&
      method === "GET" &&
      request.headers.get("accept")?.includes("text/html") &&
      response.headers.get("content-type")?.includes("json")
    ) {
      const data: any = await response.clone().json();
      if (data.redirect && data.url) {
        const headers = new Headers(response.headers);
        headers.set("location", data.url);
        headers.delete("content-type");
        response = new Response(null, { status: 302, headers });
      }
    }
    return response;
  }
  if (path === "/api/mcp" || path === "/mcp") {
    if (method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    return requireMcpAuth(
      auth,
      async (req, claims) => {
        if (
          typeof claims.sub !== "string" ||
          typeof claims.client_id !== "string"
        )
          throw new DomainError(
            "AUTH_REQUIRED",
            "A delegated user token is required.",
            401,
          );
        const a = await service.connectionActor(claims.sub, claims.client_id);
        const handler = createMcpHandler(() => makeServer(service as any, a), {
          legacy: "stateless",
          responseMode: "json",
          maxSubscriptions: 0,
        });
        try {
          return await handler.fetch(req);
        } finally {
          await handler.close();
        }
      },
      { resource: `${origin}/api/mcp`, requiredScopes: ["cove"] },
    )(request);
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user.emailVerified)
    throw new DomainError(
      "AUTH_REQUIRED",
      "Sign in to continue. Keep your unsaved draft open.",
      401,
    );
  if (
    !["GET", "HEAD"].includes(method) &&
    request.headers.get("origin") !== origin
  )
    throw new DomainError(
      "CSRF_REJECTED",
      "Use Cove from its trusted origin.",
      403,
    );
  const a: Actor = { userId: session.user.id };
  if (path === "/api/me")
    return json({
      id: a.userId,
      name: session.user.name,
      email: session.user.email,
      authMode: "chatgpt",
    });
  const query = Object.fromEntries(url.searchParams),
    pagination = () => pageSchema.parse(query);
  if (path === "/api/projects" && method === "GET") {
    const p = pagination();
    return json(await service.listProjects(a, p.offset, p.limit));
  }
  if (path === "/api/projects" && method === "POST")
    return json(await service.createProject(a, input));
  if (path === "/api/search") {
    const p = pageSchema
      .extend({ query: z.string().min(1).max(200) })
      .parse(query);
    return json(await service.search(a, p.query, p.offset, p.limit));
  }
  if (path === "/api/connections" && method === "GET")
    return json(await service.listConnections(a));
  if (path === "/api/connections" && method === "POST")
    return json(await service.saveConnection(a, input));
  if (path === "/api/connection-failure" && method === "POST")
    return json(await service.connectionFailure(a));
  const connection = path.match(/^\/api\/connections\/([^/]+)\/revoke$/);
  if (connection && method === "POST")
    return json(await service.revoke(a, z.uuid().parse(connection[1])));
  if (path === "/api/import" && method === "POST")
    return json(await service.import(a, input));
  if (path === "/api/usage" && method === "GET")
    return json(await service.usage(a));
  if (path === "/api/account" && method === "DELETE") {
    z.object({ confirmation: z.literal("DELETE MY ACCOUNT") })
      .passthrough()
      .parse(input);
    if (Date.now() - new Date(session.session.createdAt).getTime() > 300000)
      throw new DomainError(
        "REAUTH_REQUIRED",
        "Sign out and sign in again before deleting your account.",
        403,
      );
    return json(await service.deleteAccount(a));
  }
  const match = path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const p = z.uuid().parse(match[1]),
      tail = match[2] || "";
    if (!tail && method === "GET") return json(await service.context(a, p));
    if (!tail && method === "DELETE")
      return json(
        await service.deleteProject(a, p, z.string().parse(input.confirmation)),
      );
    if (tail === "context" && method === "PUT")
      return json(await service.update(a, p, input));
    if (
      ["revisions", "handoffs", "events"].includes(tail) &&
      method === "GET"
    ) {
      const q = pagination();
      return json(
        await service.listRecords(a, p, tail as "revisions", q.offset, q.limit),
      );
    }
    if (tail.startsWith("revisions/") && method === "GET")
      return json(
        await service.context(
          a,
          p,
          z.coerce.number().int().positive().parse(tail.split("/")[1]),
        ),
      );
    if (tail === "handoffs" && method === "POST")
      return json(await service.createHandoff(a, p, input));
    const h = tail.match(/^handoffs\/([^/]+)(\/copied)?$/);
    if (h) {
      const id = z.uuid().parse(h[1]);
      if (h[2] && method === "POST")
        return json(await service.recordCopy(a, p, id));
      if (!h[2] && method === "GET")
        return json(await service.handoff(a, p, id));
    }
    if (tail === "changes" && method === "GET") {
      const q = z
        .object({
          from: z.coerce.number().int().positive(),
          to: z.coerce.number().int().positive(),
        })
        .parse(query);
      return json(await service.compare(a, p, q.from, q.to));
    }
    if (tail === "restore" && method === "POST") {
      const v = z
        .object({
          version: z.number().int().positive(),
          expectedVersion: z.number().int().positive(),
          requestKey: z.string().min(8).max(100),
        })
        .strict()
        .parse(input);
      return json(
        await service.restore(a, p, v.version, v.expectedVersion, v.requestKey),
      );
    }
    if (tail === "archive" && method === "POST")
      return json(
        await service.archive(a, p, z.boolean().parse(input.archived)),
      );
    if (tail === "export" && method === "GET") {
      const data = await service.export(a, p),
        markdown = query.format === "markdown";
      return new Response(
        markdown
          ? data.revisions
              .map((r) =>
                formatHandoff({
                  projectName: data.project.name,
                  context: r.context,
                  version: r.version,
                  creator: r.author,
                  createdAt: r.createdAt,
                }),
              )
              .concat(data.handoffs.map((h) => formatHandoff(h.snapshot)))
              .join("\n\n---\n\n")
          : JSON.stringify(data),
        {
          headers: {
            "content-type": markdown
              ? "text/markdown; charset=utf-8"
              : "application/json",
            "content-disposition": `attachment; filename="cove-${p}.${markdown ? "md" : "json"}"`,
          },
        },
      );
    }
  }
  throw new DomainError("NOT_FOUND", "Route unavailable.", 404);
}
export default {
  async fetch(request: Request, env: Environment) {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (e) {
      response =
        e instanceof DomainError
          ? json(
              { error: { code: e.code, message: e.message, ...e.details } },
              e.status,
            )
          : e instanceof z.ZodError
            ? json(
                {
                  error: {
                    code: "INVALID_INPUT",
                    message: "Check the submitted fields.",
                  },
                },
                400,
              )
            : e instanceof SyntaxError
              ? json(
                  {
                    error: { code: "INVALID_INPUT", message: "Invalid JSON." },
                  },
                  400,
                )
              : json(
                  {
                    error: {
                      code: "REQUEST_FAILED",
                      message:
                        "Request failed. Retry with the same request key.",
                    },
                  },
                  500,
                );
      if (!(e instanceof DomainError) && !(e instanceof z.ZodError))
        console.error("request_failed", e instanceof Error ? e.name : "Error");
    }
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "same-origin");
    headers.set(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
};
