import { randomUUID, createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  contextSchema,
  emptyContext,
  updateSchema,
  handoffInput,
  changes,
  formatHandoff,
  type Context,
  type Snapshot,
} from "../shared/context.js";
import type { Config } from "../../apps/api/config.js";
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export type Actor = { userId: string; connectionId?: string };
type Project = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  version: number;
  archived: boolean;
  storage_bytes: string;
  created_at: string;
  updated_at: string;
};
type Revision = {
  id: string;
  project_id: string;
  version: number;
  context: Context;
  author: string;
  actor_id: string;
  summary: string;
  created_at: string;
};
type Handoff = {
  id: string;
  project_id: string;
  version: number;
  snapshot: Snapshot;
  supersedes_id: string | null;
  created_at: string;
};
type Access = { project: Project; actorId: string; label: string };
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
const fingerprint = (v: unknown): string =>
  createHash("sha256").update(canonical(v)).digest("hex");
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(v);
}
export const grantSchema = z
  .object({
    projectId: z.uuid(),
    capabilities: z
      .array(z.enum(["read", "write", "handoff"]))
      .min(1)
      .max(3)
      .refine((a) => a.includes("read"), "Read permission is required"),
  })
  .strict();
export const connectionInput = z
  .object({
    clientId: z.string().min(1).max(2048),
    label: z.string().min(1).max(100),
    grants: z.array(grantSchema).max(50),
    expiresInDays: z.number().int().min(1).max(90).optional(),
  })
  .strict();
const exportRevision = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    context: contextSchema,
    author: z.string().max(200),
    summary: z.string().max(300),
    createdAt: z.iso.datetime(),
  })
  .strict();
const snapshotSchema = z
  .object({
    projectName: z.string().min(1).max(120),
    context: contextSchema,
    version: z.number().int().positive(),
    creator: z.string().max(200),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const exportSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(1000),
        archived: z.boolean(),
      })
      .strict(),
    revisions: z.array(exportRevision).min(1).max(5000),
    handoffs: z
      .array(
        z
          .object({
            id: z.uuid(),
            version: z.number().int().positive(),
            snapshot: snapshotSchema,
            supersedesId: z.uuid().nullable(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .superRefine((v, c) => {
    if (bytes(v) > 8388608)
      c.addIssue({ code: "custom", message: "Import exceeds 8 MiB" });
    if (new Set(v.revisions.map((r) => r.id)).size !== v.revisions.length)
      c.addIssue({ code: "custom", message: "Duplicate revision ID" });
    if (new Set(v.handoffs.map((h) => h.id)).size !== v.handoffs.length)
      c.addIssue({ code: "custom", message: "Duplicate handoff ID" });
    v.revisions.forEach((r, i) => {
      if (r.version !== i + 1)
        c.addIssue({
          code: "custom",
          message: "Revisions must be contiguous and ordered from one",
        });
    });
    const seen = new Set<string>();
    for (const h of v.handoffs) {
      const r = v.revisions.find((r) => r.version === h.version);
      if (
        !r ||
        h.snapshot.version !== h.version ||
        canonical(r.context) !== canonical(h.snapshot.context)
      )
        c.addIssue({
          code: "custom",
          message: "Handoff must match its pinned revision",
        });
      if (h.supersedesId && !seen.has(h.supersedesId))
        c.addIssue({
          code: "custom",
          message:
            "Replacement must reference an earlier handoff in this export",
        });
      seen.add(h.id);
    }
  });
export class CoveService {
  public readonly limits: Pick<
    Config,
    "MAX_PROJECTS" | "MAX_REVISIONS" | "MAX_STORAGE_BYTES"
  >;
  constructor(
    public pool: Pool,
    limits: Pick<
      Config,
      "MAX_PROJECTS" | "MAX_REVISIONS" | "MAX_STORAGE_BYTES"
    >,
  ) {
    // A TypeScript type does not strip runtime fields from a configuration object.
    this.limits = Object.freeze({
      MAX_PROJECTS: limits.MAX_PROJECTS,
      MAX_REVISIONS: limits.MAX_REVISIONS,
      MAX_STORAGE_BYTES: limits.MAX_STORAGE_BYTES,
    });
  }
  async tx<T>(f: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const r = await f(db);
      await db.query("COMMIT");
      return r;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async owner(db: PoolClient, a: Actor, exclusive = false) {
    // This check also makes deletion invalidate an already authenticated in-flight request.
    const u = (
      await db.query(
        `SELECT id,name FROM "user" WHERE id=$1 FOR ${exclusive ? "UPDATE" : "SHARE"}`,
        [a.userId],
      )
    ).rows[0];
    if (!u) throw new DomainError("AUTH_REQUIRED", "Sign in again.", 401);
    await db.query(
      "INSERT INTO cove_owners(id) VALUES($1) ON CONFLICT DO NOTHING",
      [a.userId],
    );
    await db.query(
      `SELECT id FROM cove_owners WHERE id=$1 FOR ${exclusive ? "UPDATE" : "SHARE"}`,
      [a.userId],
    );
    return u as { id: string; name: string };
  }
  async access(
    db: PoolClient,
    a: Actor,
    projectId: string,
    cap = "read",
    write = false,
  ): Promise<Access> {
    const user = await this.owner(db, a, write);
    let label = user.name,
      actorId = a.userId;
    if (a.connectionId) {
      const c = (
        await db.query(
          "SELECT * FROM connections WHERE id=$1 AND owner_id=$2 FOR SHARE",
          [a.connectionId, a.userId],
        )
      ).rows[0];
      if (!c || c.status === "revoked" || new Date(c.expires_at) <= new Date())
        throw new DomainError(
          "CONNECTION_REVOKED",
          "Connection revoked or expired. Authorize a new connection.",
          401,
        );
      const g = (
        await db.query(
          "SELECT capabilities FROM grants WHERE connection_id=$1 AND project_id=$2",
          [a.connectionId, projectId],
        )
      ).rows[0];
      if (!g || !g.capabilities.includes(cap))
        throw new DomainError(
          "ACCESS_DENIED",
          "This connection does not have the required project permission.",
          403,
        );
      label = c.label;
      actorId = c.id;
    }
    const p = (
      await db.query<Project>(
        `SELECT * FROM projects WHERE id=$1 AND owner_id=$2 FOR ${write ? "UPDATE" : "SHARE"}`,
        [projectId, a.userId],
      )
    ).rows[0];
    if (!p)
      throw new DomainError("PROJECT_UNAVAILABLE", "Project unavailable.", 404);
    return { project: p, label, actorId };
  }
  human(a: Actor) {
    if (a.connectionId)
      throw new DomainError(
        "ACCESS_DENIED",
        "Only the account owner can perform this action.",
        403,
      );
  }
  async event(
    db: PoolClient,
    p: string,
    a: Access,
    operation: string,
    version: number | null = null,
    recordId: string | null = null,
  ) {
    await db.query(
      "INSERT INTO events(id,project_id,actor_id,actor,operation,version,record_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), p, a.actorId, a.label, operation, version, recordId],
    );
  }
  async measure(
    db: PoolClient,
    a: Actor,
    kind: string,
    p: string | null = null,
  ) {
    await db.query(
      "INSERT INTO measurements(id,owner_id,project_id,connection_id,kind) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), a.userId, p, a.connectionId || null, kind],
    );
  }
  async capacity(db: PoolClient, owner: string, additional: number) {
    const used = Number(
      (
        await db.query(
          "SELECT coalesce(sum(storage_bytes),0) n FROM projects WHERE owner_id=$1",
          [owner],
        )
      ).rows[0].n,
    );
    if (used + additional > this.limits.MAX_STORAGE_BYTES)
      throw new DomainError(
        "STORAGE_LIMIT",
        "Account storage limit reached. Export and remove unneeded projects before adding data.",
        413,
      );
  }
  async replay(
    db: PoolClient,
    ac: Access,
    operation: string,
    key: string,
    payload: unknown,
  ) {
    const r = (
      await db.query(
        "SELECT * FROM idempotency WHERE actor_id=$1 AND project_id=$2 AND operation=$3 AND request_key=$4",
        [ac.actorId, ac.project.id, operation, key],
      )
    ).rows[0];
    if (r && new Date(r.expires_at) > new Date()) {
      if (r.fingerprint !== fingerprint(payload))
        throw new DomainError(
          "IDEMPOTENCY_MISMATCH",
          "This request key was already used with different content.",
          409,
        );
      return r.result;
    }
    return undefined;
  }
  async remember(
    db: PoolClient,
    ac: Access,
    operation: string,
    key: string,
    payload: unknown,
    result: unknown,
  ) {
    await db.query(
      "INSERT INTO idempotency(actor_id,project_id,operation,request_key,fingerprint,result,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days') ON CONFLICT(actor_id,project_id,operation,request_key) DO UPDATE SET fingerprint=excluded.fingerprint,result=excluded.result,expires_at=excluded.expires_at",
      [
        ac.actorId,
        ac.project.id,
        operation,
        key,
        fingerprint(payload),
        JSON.stringify(result),
      ],
    );
  }
  conflict(p: Project, expected: number) {
    if (p.version !== expected)
      throw new DomainError(
        "VERSION_CONFLICT",
        "Your saved base has changed. Inspect changes and explicitly retry with the current version.",
        409,
        {
          currentVersion: p.version,
          changesPath: `/api/projects/${p.id}/changes?from=${expected}&to=${p.version}`,
        },
      );
  }
  async createProject(a: Actor, input: unknown) {
    this.human(a);
    const v = z
      .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(1000).default(""),
        context: contextSchema.default(emptyContext()),
      })
      .strict()
      .parse(input);
    return this.tx(async (db) => {
      const u = await this.owner(db, a, true);
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM projects WHERE owner_id=$1",
              [a.userId],
            )
          ).rows[0].n,
        ) >= this.limits.MAX_PROJECTS
      )
        throw new DomainError("PROJECT_LIMIT", "Project limit reached.", 413);
      await this.capacity(db, a.userId, bytes(v.context));
      const p = (
        await db.query<Project>(
          "INSERT INTO projects(id,owner_id,name,description,version,storage_bytes) VALUES($1,$2,$3,$4,1,$5) RETURNING *",
          [randomUUID(), a.userId, v.name, v.description, bytes(v.context)],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO revisions(id,project_id,version,context,author,actor_id,summary) VALUES($1,$2,1,$3,$4,$5,$6)",
        [
          randomUUID(),
          p.id,
          JSON.stringify(v.context),
          u.name,
          a.userId,
          "Project created",
        ],
      );
      await this.event(
        db,
        p.id,
        { project: p, actorId: a.userId, label: u.name },
        "project_created",
        1,
      );
      await this.measure(db, a, "project_created", p.id);
      return p;
    });
  }
  async listProjects(a: Actor, offset = 0, limit = 20) {
    return this.tx(async (db) => {
      await this.owner(db, a);
      if (a.connectionId) await this.checkConnection(db, a);
      const where = a.connectionId
        ? "AND EXISTS(SELECT 1 FROM grants g WHERE g.project_id=p.id AND g.connection_id=$2 AND g.capabilities ? 'read')"
        : "";
      const args = a.connectionId ? [a.userId, a.connectionId] : [a.userId];
      const rows = (
        await db.query(
          `SELECT p.* FROM projects p WHERE owner_id=$1 ${where} ORDER BY updated_at DESC,id LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
          [...args, limit + 1, offset],
        )
      ).rows;
      return {
        items: rows.slice(0, limit),
        nextOffset: rows.length > limit ? offset + limit : null,
        limit,
      };
    });
  }
  async checkConnection(db: PoolClient, a: Actor) {
    const c = (
      await db.query(
        "SELECT * FROM connections WHERE id=$1 AND owner_id=$2 FOR SHARE",
        [a.connectionId, a.userId],
      )
    ).rows[0];
    if (!c || c.status === "revoked" || new Date(c.expires_at) <= new Date())
      throw new DomainError(
        "CONNECTION_REVOKED",
        "Connection revoked or expired.",
        401,
      );
    return c;
  }
  async context(a: Actor, p: string, version?: number, concise = false) {
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p);
      const r = (
        await db.query<Revision>(
          "SELECT * FROM revisions WHERE project_id=$1 AND version=$2",
          [p, version || ac.project.version],
        )
      ).rows[0];
      if (!r)
        throw new DomainError(
          "REVISION_UNAVAILABLE",
          "Revision unavailable.",
          404,
        );
      return {
        project: ac.project,
        revision: concise
          ? {
              ...r,
              context: undefined,
              preview: formatHandoff(
                {
                  projectName: ac.project.name,
                  context: r.context,
                  version: r.version,
                  creator: r.author,
                  createdAt: new Date(r.created_at).toISOString(),
                },
                true,
              ),
              fullDetailTool: "cove_get_context with detail=full",
            }
          : r,
      };
    });
  }
  async update(a: Actor, p: string, input: unknown) {
    const v = updateSchema.parse(input);
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p, "write", true);
      const old = await this.replay(db, ac, "update", v.requestKey, v);
      if (old) return old;
      this.conflict(ac.project, v.expectedVersion);
      if (ac.project.version >= this.limits.MAX_REVISIONS)
        throw new DomainError(
          "REVISION_LIMIT",
          "Revision limit reached; export and create a successor project.",
          413,
        );
      await this.capacity(db, a.userId, bytes(v.context));
      const version = ac.project.version + 1;
      const r = (
        await db.query<Revision>(
          "INSERT INTO revisions(id,project_id,version,context,author,actor_id,summary) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            p,
            version,
            JSON.stringify(v.context),
            ac.label,
            ac.actorId,
            v.summary,
          ],
        )
      ).rows[0];
      await db.query(
        "UPDATE projects SET version=$2,storage_bytes=storage_bytes+$3,updated_at=now() WHERE id=$1",
        [p, version, bytes(v.context)],
      );
      await this.event(db, p, ac, "context_saved", version, r.id);
      await this.measure(db, a, "context_saved", p);
      if (
        a.connectionId &&
        (
          await db.query(
            "SELECT 1 FROM revisions WHERE project_id=$1 AND actor_id<>$2 AND actor_id<>$3 LIMIT 1",
            [p, a.connectionId, a.userId],
          )
        ).rowCount
      )
        await this.measure(db, a, "update_through_another_connection", p);
      const result = { id: r.id, projectId: p, version };
      await this.remember(db, ac, "update", v.requestKey, v, result);
      return result;
    });
  }
  async restore(
    a: Actor,
    p: string,
    version: number,
    expectedVersion: number,
    key: string,
  ) {
    this.human(a);
    const old = await this.context(a, p, version);
    return this.update(a, p, {
      context: old.revision.context,
      expectedVersion,
      requestKey: key,
      summary: `Restored revision ${version}`,
    });
  }
  async createHandoff(a: Actor, p: string, input: unknown) {
    const v = handoffInput.parse(input);
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p, "handoff", true);
      const old = await this.replay(db, ac, "handoff", v.requestKey, v);
      if (old) return old;
      this.conflict(ac.project, v.expectedVersion);
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM handoffs WHERE project_id=$1",
              [p],
            )
          ).rows[0].n,
        ) >= 1000
      )
        throw new DomainError("HANDOFF_LIMIT", "Handoff limit reached.", 413);
      if (
        v.supersedesId &&
        !(
          await db.query(
            "SELECT 1 FROM handoffs WHERE id=$1 AND project_id=$2",
            [v.supersedesId, p],
          )
        ).rowCount
      )
        throw new DomainError(
          "INVALID_HANDOFF",
          "Replacement must belong to this project.",
          400,
        );
      const r = (
        await db.query<Revision>(
          "SELECT * FROM revisions WHERE project_id=$1 AND version=$2",
          [p, v.expectedVersion],
        )
      ).rows[0];
      const snapshot: Snapshot = {
        projectName: ac.project.name,
        version: r.version,
        context: r.context,
        creator: ac.label,
        createdAt: new Date().toISOString(),
      };
      await this.capacity(db, a.userId, bytes(snapshot));
      const h = (
        await db.query<Handoff>(
          "INSERT INTO handoffs(id,project_id,version,snapshot,supersedes_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            randomUUID(),
            p,
            r.version,
            JSON.stringify(snapshot),
            v.supersedesId || null,
          ],
        )
      ).rows[0];
      await db.query(
        "UPDATE projects SET storage_bytes=storage_bytes+$2 WHERE id=$1",
        [p, bytes(snapshot)],
      );
      await this.event(db, p, ac, "handoff_created", r.version, h.id);
      await this.measure(db, a, "handoff_created", p);
      const result = { id: h.id, projectId: p, version: r.version };
      await this.remember(db, ac, "handoff", v.requestKey, v, result);
      return result;
    });
  }
  async handoff(a: Actor, p: string, h: string) {
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p);
      const r = (
        await db.query<Handoff>(
          "SELECT * FROM handoffs WHERE id=$1 AND project_id=$2",
          [h, p],
        )
      ).rows[0];
      if (!r)
        throw new DomainError(
          "INVALID_HANDOFF",
          "Handoff unavailable in this project.",
          404,
        );
      const latest = (
        await db.query<Revision>(
          "SELECT context FROM revisions WHERE project_id=$1 AND version=$2",
          [p, ac.project.version],
        )
      ).rows[0];
      if (a.connectionId) {
        await this.measure(db, a, "handoff_retrieved_mcp", p);
        await this.event(db, p, ac, "handoff_retrieved", r.version, h);
      }
      return {
        ...r,
        currentVersion: ac.project.version,
        hasNewerChanges: ac.project.version > r.version,
        changes: changes(r.snapshot.context, latest.context),
        concise: formatHandoff(r.snapshot, true),
        full: formatHandoff(r.snapshot),
      };
    });
  }
  async listRecords(
    a: Actor,
    p: string,
    kind: "revisions" | "handoffs" | "events",
    offset = 0,
    limit = 20,
  ) {
    return this.tx(async (db) => {
      await this.access(db, a, p);
      const columns =
        kind === "revisions"
          ? "id,version,author,summary,created_at"
          : kind === "handoffs"
            ? "id,version,supersedes_id,created_at"
            : "*";
      const r = (
        await db.query(
          `SELECT ${columns} FROM ${kind} WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`,
          [p, limit + 1, offset],
        )
      ).rows;
      return {
        items: r.slice(0, limit),
        nextOffset: r.length > limit ? offset + limit : null,
        limit,
      };
    });
  }
  async compare(a: Actor, p: string, from: number, to: number) {
    return this.tx(async (db) => {
      await this.access(db, a, p);
      const r = (
        await db.query<Revision>(
          "SELECT * FROM revisions WHERE project_id=$1 AND version=ANY($2::int[])",
          [p, [from, to]],
        )
      ).rows;
      const b = r.find((x) => x.version === from),
        n = r.find((x) => x.version === to);
      if (!b || !n)
        throw new DomainError(
          "REVISION_UNAVAILABLE",
          "Comparison revision unavailable.",
          404,
        );
      return { from, to, changes: changes(b.context, n.context) };
    });
  }
  async search(a: Actor, query: string, offset = 0, limit = 20) {
    return this.tx(async (db) => {
      await this.owner(db, a);
      if (a.connectionId) await this.checkConnection(db, a);
      const r = (
        await db.query(
          "SELECT p.id,p.name,p.version,left(r.context->>'summary',300) summary FROM projects p JOIN revisions r ON r.project_id=p.id AND r.version=p.version WHERE p.owner_id=$1 AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM grants g WHERE g.project_id=p.id AND g.connection_id=$2 AND g.capabilities ? 'read')) AND (to_tsvector('simple',p.name||' '||p.description) @@ plainto_tsquery('simple',$3) OR r.search_document @@ plainto_tsquery('simple',$3)) ORDER BY p.updated_at DESC,p.id LIMIT $4 OFFSET $5",
          [a.userId, a.connectionId || null, query, limit + 1, offset],
        )
      ).rows;
      return {
        items: r.slice(0, limit),
        nextOffset: r.length > limit ? offset + limit : null,
        limit,
      };
    });
  }
  async connectionActor(userId: string, clientId: string) {
    return this.tx(async (db) => {
      const c = (
        await db.query(
          "SELECT * FROM connections WHERE owner_id=$1 AND client_id=$2",
          [userId, clientId],
        )
      ).rows[0];
      if (!c)
        throw new DomainError(
          "ACCESS_DENIED",
          "Approve this assistant and its project grants in Cove.",
          403,
        );
      const a = { userId, connectionId: c.id };
      await this.owner(db, a, true);
      await this.checkConnection(db, a);
      await db.query(
        "UPDATE connections SET status='active',last_activity=now() WHERE id=$1",
        [c.id],
      );
      return a;
    });
  }
  async saveConnection(a: Actor, input: unknown) {
    this.human(a);
    const v = connectionInput.parse(input);
    return this.tx(async (db) => {
      await this.owner(db, a, true);
      const existing = (
        await db.query(
          "SELECT * FROM connections WHERE owner_id=$1 AND client_id=$2 FOR UPDATE",
          [a.userId, v.clientId],
        )
      ).rows[0];
      if (existing?.status === "revoked")
        throw new DomainError(
          "CONNECTION_REVOKED",
          "Revoked bindings cannot be reused. Register a fresh OAuth client.",
          409,
        );
      if (
        !existing &&
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM connections WHERE owner_id=$1",
              [a.userId],
            )
          ).rows[0].n,
        ) >= 100
      )
        throw new DomainError(
          "CONNECTION_LIMIT",
          "Connection limit reached.",
          413,
        );
      for (const g of v.grants) {
        const p = (
          await db.query(
            "SELECT id FROM projects WHERE id=$1 AND owner_id=$2",
            [g.projectId, a.userId],
          )
        ).rows[0];
        if (!p)
          throw new DomainError(
            "ACCESS_DENIED",
            "You can grant only your own projects.",
            403,
          );
      }
      if (new Set(v.grants.map((g) => g.projectId)).size !== v.grants.length)
        throw new DomainError(
          "INVALID_GRANTS",
          "Each project may appear only once.",
        );
      const cid = existing?.id || randomUUID();
      await db.query(
        "INSERT INTO connections(id,owner_id,client_id,label,status,expires_at) VALUES($1,$2,$3,$4,'pending',$5) ON CONFLICT(owner_id,client_id) DO UPDATE SET label=excluded.label,expires_at=excluded.expires_at",
        [
          cid,
          a.userId,
          v.clientId,
          v.label,
          existing && v.expiresInDays === undefined
            ? existing.expires_at
            : new Date(Date.now() + (v.expiresInDays ?? 30) * 86400000),
        ],
      );
      await db.query("DELETE FROM grants WHERE connection_id=$1", [cid]);
      for (const g of v.grants) {
        await db.query(
          "INSERT INTO grants(connection_id,project_id,capabilities) VALUES($1,$2,$3)",
          [cid, g.projectId, JSON.stringify([...new Set(g.capabilities)])],
        );
        const p = (
          await db.query<Project>("SELECT * FROM projects WHERE id=$1", [
            g.projectId,
          ])
        ).rows[0];
        await this.event(
          db,
          p.id,
          { project: p, actorId: a.userId, label: "Owner" },
          "grants_changed",
        );
      }
      return { id: cid };
    });
  }
  async listConnections(a: Actor) {
    this.human(a);
    return this.tx(async (db) => {
      await this.owner(db, a);
      return (
        await db.query(
          "SELECT c.*,coalesce((SELECT json_agg(json_build_object('projectId',g.project_id,'capabilities',g.capabilities)) FROM grants g WHERE g.connection_id=c.id),'[]') grants FROM connections c WHERE owner_id=$1 ORDER BY created_at DESC",
          [a.userId],
        )
      ).rows;
    });
  }
  async revoke(a: Actor, cid: string) {
    this.human(a);
    return this.tx(async (db) => {
      await this.owner(db, a, true);
      const c = (
        await db.query(
          "UPDATE connections SET status='revoked' WHERE id=$1 AND owner_id=$2 RETURNING id",
          [cid, a.userId],
        )
      ).rows[0];
      if (!c)
        throw new DomainError("ACCESS_DENIED", "Connection unavailable.", 404);
      await db.query(
        "INSERT INTO security_ledger(id,kind,target_id) VALUES($1,$2,$3)",
        [randomUUID(), "connection_revoked", cid],
      );
      await db.query("DELETE FROM grants WHERE connection_id=$1", [cid]);
      return { revoked: true };
    });
  }
  async export(a: Actor, p: string) {
    this.human(a);
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p);
      const r = (
        await db.query<Revision>(
          "SELECT * FROM revisions WHERE project_id=$1 ORDER BY version",
          [p],
        )
      ).rows;
      const h = (
        await db.query<Handoff>(
          "SELECT * FROM handoffs WHERE project_id=$1 ORDER BY created_at,id",
          [p],
        )
      ).rows;
      const out = {
        schemaVersion: 1 as const,
        project: {
          id: p,
          name: ac.project.name,
          description: ac.project.description,
          archived: ac.project.archived,
        },
        revisions: r.map((x) => ({
          id: x.id,
          version: x.version,
          context: x.context,
          author: x.author,
          summary: x.summary,
          createdAt: new Date(x.created_at).toISOString(),
        })),
        handoffs: h.map((x) => ({
          id: x.id,
          version: x.version,
          snapshot: x.snapshot,
          supersedesId: x.supersedes_id,
        })),
      };
      if (bytes(out) > 8388608)
        throw new DomainError(
          "RESPONSE_LIMIT",
          "Export exceeds the 8 MiB JSON limit. Use the documented database-assisted export procedure.",
          413,
        );
      return out;
    });
  }
  async import(a: Actor, input: unknown) {
    this.human(a);
    const v = exportSchema.parse(input);
    return this.tx(async (db) => {
      const u = await this.owner(db, a, true);
      if (v.revisions.length > this.limits.MAX_REVISIONS)
        throw new DomainError(
          "REVISION_LIMIT",
          "Import exceeds configured revision limit.",
          413,
        );
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM projects WHERE owner_id=$1",
              [a.userId],
            )
          ).rows[0].n,
        ) >= this.limits.MAX_PROJECTS
      )
        throw new DomainError("PROJECT_LIMIT", "Project limit reached.", 413);
      const size =
        v.revisions.reduce((n, r) => n + bytes(r.context), 0) +
        v.handoffs.reduce((n, h) => n + bytes(h.snapshot), 0);
      await this.capacity(db, a.userId, size);
      const p = (
        await db.query<Project>(
          "INSERT INTO projects(id,owner_id,name,description,archived,version,storage_bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            a.userId,
            v.project.name,
            v.project.description,
            v.project.archived,
            v.revisions.length,
            size,
          ],
        )
      ).rows[0];
      const ids = new Map<string, string>();
      const remap = (old: string) => {
        if (!ids.has(old)) ids.set(old, randomUUID());
        return ids.get(old)!;
      };
      const remapContext = (ctx: Context): Context => {
        const out = structuredClone(ctx);
        for (const k of [
          "constraints",
          "decisions",
          "notes",
          "completedWork",
          "nextSteps",
          "openQuestions",
          "sources",
          "artifacts",
        ] as const) {
          for (const e of out[k]) {
            e.id = remap(e.id);
            if ("sourceIds" in e) e.sourceIds = e.sourceIds.map(remap);
          }
        }
        return out;
      };
      for (const r of v.revisions)
        await db.query(
          "INSERT INTO revisions(id,project_id,version,context,author,actor_id,summary,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            remap(r.id),
            p.id,
            r.version,
            JSON.stringify(remapContext(r.context)),
            `Imported: ${r.author}`.slice(0, 200),
            `import:${randomUUID()}`,
            r.summary,
            r.createdAt,
          ],
        );
      for (const h of v.handoffs)
        await db.query(
          "INSERT INTO handoffs(id,project_id,version,snapshot,supersedes_id) VALUES($1,$2,$3,$4,$5)",
          [
            remap(h.id),
            p.id,
            h.version,
            JSON.stringify({
              ...h.snapshot,
              context: remapContext(h.snapshot.context),
              creator: `Imported: ${h.snapshot.creator}`.slice(0, 200),
            }),
            h.supersedesId ? remap(h.supersedesId) : null,
          ],
        );
      await this.event(
        db,
        p.id,
        { project: p, actorId: a.userId, label: u.name },
        "project_imported",
        p.version,
      );
      return p;
    });
  }
  async archive(a: Actor, p: string, archived: boolean) {
    this.human(a);
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p, "read", true);
      await db.query("UPDATE projects SET archived=$2 WHERE id=$1", [
        p,
        archived,
      ]);
      await this.event(
        db,
        p,
        ac,
        archived ? "project_archived" : "project_unarchived",
      );
      return { archived };
    });
  }
  async deleteProject(a: Actor, p: string, confirmation: string) {
    this.human(a);
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p, "read", true);
      if (confirmation !== ac.project.name)
        throw new DomainError(
          "CONFIRMATION_REQUIRED",
          "Type the project name to permanently delete it.",
        );
      await db.query(
        "INSERT INTO security_ledger(id,kind,target_id) VALUES($1,$2,$3)",
        [randomUUID(), "project_deleted", p],
      );
      await db.query("DELETE FROM projects WHERE id=$1", [p]);
      return { deleted: true };
    });
  }
  async deleteAccount(a: Actor) {
    this.human(a);
    return this.tx(async (db) => {
      await this.owner(db, a, true);
      await db.query(
        "INSERT INTO security_ledger(id,kind,target_id) VALUES($1,$2,$3)",
        [randomUUID(), "account_deleted", a.userId],
      );
      await db.query("DELETE FROM cove_owners WHERE id=$1", [a.userId]);
      await db.query('DELETE FROM "user" WHERE id=$1', [a.userId]);
      return { deleted: true };
    });
  }
  async usage(a: Actor) {
    this.human(a);
    return this.tx(async (db) => {
      await this.owner(db, a);
      return {
        observations: (
          await db.query(
            "SELECT kind,count(*)::int count FROM measurements WHERE owner_id=$1 GROUP BY kind ORDER BY kind",
            [a.userId],
          )
        ).rows,
        storageBytes: Number(
          (
            await db.query(
              "SELECT coalesce(sum(storage_bytes),0) n FROM projects WHERE owner_id=$1",
              [a.userId],
            )
          ).rows[0].n,
        ),
        limits: {
          MAX_PROJECTS: this.limits.MAX_PROJECTS,
          MAX_REVISIONS: this.limits.MAX_REVISIONS,
          MAX_STORAGE_BYTES: this.limits.MAX_STORAGE_BYTES,
        },
        interpretation:
          "Retrieval and distinct credentials do not prove successful continuation or different model providers.",
      };
    });
  }
  async recordCopy(a: Actor, p: string, h: string) {
    this.human(a);
    return this.tx(async (db) => {
      const ac = await this.access(db, a, p);
      if (
        !(
          await db.query(
            "SELECT 1 FROM handoffs WHERE id=$1 AND project_id=$2",
            [h, p],
          )
        ).rowCount
      )
        throw new DomainError("INVALID_HANDOFF", "Handoff unavailable.", 404);
      await this.measure(db, a, "copy_success_reported", p);
      await this.event(db, p, ac, "copy_success_reported", null, h);
      return { recorded: true };
    });
  }
}
