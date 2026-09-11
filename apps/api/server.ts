import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { database } from "../../packages/database/db.js";
import {
  CoveService,
  DomainError,
  type Actor,
} from "../../packages/domain/service.js";
import { pageSchema, formatHandoff } from "../../packages/shared/context.js";
import { makeAuth } from "./auth.js";
import { mcpHandler } from "../../packages/mcp/server.js";
import type { Config } from "./config.js";
export async function buildServer(c: Config) {
  const { pool } = database(c.DATABASE_URL);
  const auth = makeAuth(pool, c);
  const service = new CoveService(pool, c);
  const app = Fastify({
    logger:
      c.NODE_ENV === "test"
        ? false
        : {
            level: "info",
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
            ],
          },
    disableRequestLogging: true,
    bodyLimit: 131072,
    trustProxy: c.TRUST_PROXY === "true",
    requestTimeout: 30000,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: c.NODE_ENV === "production" ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { max: c.RATE_LIMIT, timeWindow: "1 minute" });
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) =>
      done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  app.addHook("onRequest", async (req, reply) => {
    if (req.headers.host !== new URL(c.APP_URL).host)
      throw new DomainError("INVALID_HOST", "Unrecognized host.", 400);
    if (req.headers.origin && req.headers.origin !== c.APP_URL)
      throw new DomainError("INVALID_ORIGIN", "Origin is not permitted.", 403);
    reply.header("Cache-Control", "no-store");
  });
  app.addHook("onResponse", async (req, reply) => {
    req.log.info(
      {
        requestId: req.id,
        route: req.routeOptions.url || "unknown",
        method: req.method,
        status: reply.statusCode,
        latencyMs: Math.round(reply.elapsedTime),
      },
      "request_complete",
    );
  });
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof DomainError)
      return reply.code(e.status).send({
        error: { code: e.code, message: e.message, ...e.details },
        requestId: req.id,
      });
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "Check the submitted fields.",
          issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        requestId: req.id,
      });
    const status = (e as { statusCode?: number }).statusCode;
    req.log.error(
      {
        requestId: req.id,
        errorType: e instanceof Error ? e.name : "Error",
        code: (e as { code?: string }).code,
      },
      "request_failed",
    );
    return reply
      .code(status && status >= 400 && status < 500 ? status : 500)
      .send({
        error: {
          code:
            status === 413
              ? "PAYLOAD_LIMIT"
              : status === 429
                ? "RATE_LIMIT"
                : "REQUEST_FAILED",
          message:
            status === 413
              ? "Payload exceeds the allowed size."
              : status === 429
                ? "Too many requests. Try again shortly."
                : "Request failed. Retry or contact the operator with this request ID.",
        },
        requestId: req.id,
      });
  });
  const webRequest = (req: FastifyRequest) =>
    new Request(new URL(req.raw.url || "/", c.APP_URL), {
      method: req.method,
      headers: new Headers([
        ...Object.entries(req.headers)
          .filter(([k]) => k !== "x-cove-client-ip")
          .flatMap(([k, v]): [string, string][] =>
            v === undefined ? [] : [[k, Array.isArray(v) ? v.join(", ") : v]],
          ),
        ["x-cove-client-ip", req.ip],
      ]),
      ...(!["GET", "HEAD"].includes(req.method) && req.body !== undefined
        ? {
            body: req.headers["content-type"]?.includes(
              "application/x-www-form-urlencoded",
            )
              ? new URLSearchParams(
                  req.body as Record<string, string>,
                ).toString()
              : JSON.stringify(req.body),
          }
        : {}),
    });
  const sendWeb = async (reply: FastifyReply, res: Response) => {
    reply.code(res.status);
    res.headers.forEach((v, k) => {
      if (k !== "set-cookie") reply.header(k, v);
    });
    const cookies = res.headers.getSetCookie();
    if (cookies.length) reply.header("set-cookie", cookies);
    return reply.send(Buffer.from(await res.arrayBuffer()));
  };
  const authRoute = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.body && typeof req.body === "object" && "name" in req.body)
      z.string().trim().min(1).max(100).parse(req.body.name);
    const res = await auth.handler(webRequest(req));
    // Better Auth's OAuth API returns a redirect descriptor. Browser navigation
    // needs the provider-validated destination converted into an HTTP redirect.
    if (
      res.status === 200 &&
      req.method === "GET" &&
      req.headers.accept?.includes("text/html") &&
      res.headers.get("content-type")?.includes("application/json")
    ) {
      const data = (await res.clone().json()) as {
        redirect?: boolean;
        url?: string;
      };
      if (data.redirect && data.url) {
        const cookies = res.headers.getSetCookie();
        if (cookies.length) reply.header("set-cookie", cookies);
        return reply.redirect(data.url);
      }
    }
    return sendWeb(reply, res);
  };
  app.route({
    method: ["GET", "POST", "OPTIONS"],
    url: "/api/auth/*",
    handler: authRoute,
  });
  app.get("/.well-known/*", authRoute);
  const mcp = mcpHandler(auth, service, c.APP_URL);
  app.post("/mcp", async (req, reply) =>
    sendWeb(reply, await mcp(webRequest(req))),
  );
  app.route({
    method: ["GET", "DELETE"],
    url: "/mcp",
    handler: async (_req, reply) =>
      reply
        .code(405)
        .header("Allow", "POST")
        .send({ error: "Use MCP Streamable HTTP POST." }),
  });
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_req, reply) => {
    try {
      await pool.query("SELECT 1 FROM projects LIMIT 1");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  const actor = async (
    req: FastifyRequest,
    mutation = false,
  ): Promise<Actor> => {
    if (mutation && req.headers.origin !== c.APP_URL)
      throw new DomainError(
        "CSRF_REJECTED",
        "Use Cove from its trusted origin.",
        403,
      );
    const s = await auth.api.getSession({ headers: webRequest(req).headers });
    if (!s || !s.user.emailVerified)
      throw new DomainError(
        "AUTH_REQUIRED",
        "Your session expired. Sign in to continue; keep your unsaved draft open.",
        401,
      );
    return { userId: s.user.id };
  };
  const pid = (req: FastifyRequest) =>
    z.uuid().parse((req.params as { id: string }).id);
  const hid = (req: FastifyRequest) =>
    z.uuid().parse((req.params as { hid: string }).hid);
  app.get("/api/me", async (req) => {
    const a = await actor(req);
    const s = await auth.api.getSession({ headers: webRequest(req).headers });
    return { id: a.userId, name: s!.user.name, email: s!.user.email };
  });
  app.get("/api/projects", async (req) => {
    const p = pageSchema.parse(req.query);
    return service.listProjects(await actor(req), p.offset, p.limit);
  });
  app.post("/api/projects", async (req) =>
    service.createProject(await actor(req, true), req.body),
  );
  app.get("/api/projects/:id", async (req) =>
    service.context(await actor(req), pid(req)),
  );
  app.put("/api/projects/:id/context", async (req) =>
    service.update(await actor(req, true), pid(req), req.body),
  );
  app.get("/api/projects/:id/revisions/:version", async (req) =>
    service.context(
      await actor(req),
      pid(req),
      z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as any).version),
    ),
  );
  for (const kind of ["revisions", "handoffs", "events"] as const)
    app.get(`/api/projects/:id/${kind}`, async (req) => {
      const p = pageSchema.parse(req.query);
      return service.listRecords(
        await actor(req),
        pid(req),
        kind,
        p.offset,
        p.limit,
      );
    });
  app.get("/api/projects/:id/changes", async (req) => {
    const v = z
      .object({
        from: z.coerce.number().int().positive(),
        to: z.coerce.number().int().positive(),
      })
      .parse(req.query);
    return service.compare(await actor(req), pid(req), v.from, v.to);
  });
  app.post("/api/projects/:id/restore", async (req) => {
    const v = z
      .object({
        version: z.number().int().positive(),
        expectedVersion: z.number().int().positive(),
        requestKey: z.string().min(8).max(100),
      })
      .strict()
      .parse(req.body);
    return service.restore(
      await actor(req, true),
      pid(req),
      v.version,
      v.expectedVersion,
      v.requestKey,
    );
  });
  app.post("/api/projects/:id/handoffs", async (req) =>
    service.createHandoff(await actor(req, true), pid(req), req.body),
  );
  app.get("/api/projects/:id/handoffs/:hid", async (req) =>
    service.handoff(await actor(req), pid(req), hid(req)),
  );
  app.post("/api/projects/:id/handoffs/:hid/copied", async (req) =>
    service.recordCopy(await actor(req, true), pid(req), hid(req)),
  );
  app.get("/api/search", async (req) => {
    const v = pageSchema
      .extend({ query: z.string().min(1).max(200) })
      .parse(req.query);
    return service.search(await actor(req), v.query, v.offset, v.limit);
  });
  app.get("/api/connections", async (req) =>
    service.listConnections(await actor(req)),
  );
  app.post("/api/connections", async (req) =>
    service.saveConnection(await actor(req, true), req.body),
  );
  app.post("/api/connections/:id/revoke", async (req) =>
    service.revoke(await actor(req, true), pid(req)),
  );
  app.post("/api/connection-failure", async (req) => {
    const a = await actor(req, true);
    return service.tx(async (db) => {
      await service.owner(db, a);
      await service.measure(db, a, "connection_setup_failure");
      return { recorded: true };
    });
  });
  app.get("/api/projects/:id/export", async (req, reply) => {
    const data = await service.export(await actor(req), pid(req));
    const markdown = (req.query as { format?: string }).format === "markdown";
    reply.header(
      "Content-Disposition",
      `attachment; filename="cove-${pid(req)}.${markdown ? "md" : "json"}"`,
    );
    if (markdown) {
      const texts = data.revisions.map((r) =>
        formatHandoff({
          projectName: data.project.name,
          context: r.context,
          version: r.version,
          creator: r.author,
          createdAt: r.createdAt,
        }),
      );
      texts.push(
        ...data.handoffs.map(
          (h) => `# Handoff ${h.id}\n${formatHandoff(h.snapshot)}`,
        ),
      );
      return reply
        .type("text/markdown; charset=utf-8")
        .send(texts.join("\n\n---\n\n"));
    }
    return data;
  });
  app.post("/api/import", { bodyLimit: 8388608 }, async (req) =>
    service.import(await actor(req, true), req.body),
  );
  app.post("/api/projects/:id/archive", async (req) =>
    service.archive(
      await actor(req, true),
      pid(req),
      z.object({ archived: z.boolean() }).strict().parse(req.body).archived,
    ),
  );
  app.delete("/api/projects/:id", async (req) =>
    service.deleteProject(
      await actor(req, true),
      pid(req),
      z.object({ confirmation: z.string() }).strict().parse(req.body)
        .confirmation,
    ),
  );
  app.get("/api/usage", async (req) => service.usage(await actor(req)));
  app.delete("/api/account", async (req) => {
    const a = await actor(req, true);
    const v = z
      .object({
        password: z.string().min(1),
        confirmation: z.literal("DELETE MY ACCOUNT"),
      })
      .strict()
      .parse(req.body);
    await auth.api.verifyPassword({
      headers: webRequest(req).headers,
      body: { password: v.password },
    });
    return service.deleteAccount(a);
  });
  const web = resolve("dist/web");
  if (existsSync(web)) {
    await app.register(staticFiles, { root: web, wildcard: true });
    app.setNotFoundHandler(async (req, reply) => {
      if (
        req.url.startsWith("/assets") ||
        req.url.startsWith("/api") ||
        req.url.startsWith("/.well-known") ||
        req.url.startsWith("/mcp")
      )
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Route unavailable." },
        });
      return reply.sendFile("index.html");
    });
  }
  app.addHook("onClose", async () => pool.end());
  return { app, auth, service, pool };
}
