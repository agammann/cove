import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  DomainError,
  connectionInput,
  exportSchema,
  type Actor,
} from "../../packages/domain/service.js";
import {
  contextSchema,
  emptyContext,
  updateSchema,
  handoffInput,
  changes,
  formatHandoff,
  type Context,
  type Snapshot,
} from "../../packages/shared/context.js";
import type { Database, Statement } from "./types.js";
const now = () => new Date().toISOString();
const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const canonical = (v: any): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",")}}`
      : JSON.stringify(v);
const hash = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
const fail = (code: string, message: string, status = 400, details = {}) => {
  throw new DomainError(code, message, status, details);
};
const page = (rows: any[], offset: number, limit: number) => ({
  items: rows.slice(0, limit),
  nextOffset: rows.length > limit ? offset + limit : null,
  limit,
});
type Write = {
  statements: Statement[];
  owner: any;
  label: string;
  actorId: string;
};
export class SitesService {
  readonly limits = Object.freeze({
    MAX_PROJECTS: 50,
    MAX_REVISIONS: 1000,
    MAX_STORAGE_BYTES: 104857600,
  });
  constructor(readonly db: Database) {}
  q(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async all(sql: string, ...args: unknown[]) {
    return (await this.q(sql, ...args).all()).results;
  }
  async first(sql: string, ...args: unknown[]) {
    return this.q(sql, ...args).first<any>();
  }
  human(a: Actor) {
    if (a.connectionId)
      fail(
        "ACCESS_DENIED",
        "Only the account owner can perform this action.",
        403,
      );
  }
  async owner(a: Actor) {
    const u = await this.first(
      "SELECT * FROM site_owners WHERE id=?",
      a.userId,
    );
    if (!u) fail("AUTH_REQUIRED", "Sign in to continue.", 401);
    return u;
  }
  async connection(a: Actor) {
    if (!a.connectionId) return;
    const c = await this.first(
      "SELECT * FROM site_connections WHERE id=? AND owner_id=?",
      a.connectionId,
      a.userId,
    );
    if (!c || c.status === "revoked" || c.expires_at <= now())
      fail("CONNECTION_REVOKED", "Connection revoked or expired.", 401);
    return c;
  }
  async access(a: Actor, p: string, cap = "read") {
    await this.owner(a);
    await this.connection(a);
    const row = await this.first(
      `SELECT p.* FROM site_projects p WHERE p.id=? AND p.owner_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM site_grants g JOIN site_connections c ON c.id=g.connection_id WHERE g.project_id=p.id AND c.id=? AND c.owner_id=p.owner_id AND c.status!='revoked' AND c.expires_at>? AND EXISTS(SELECT 1 FROM json_each(g.capabilities) WHERE value=?)))`,
      p,
      a.userId,
      a.connectionId || null,
      a.connectionId || null,
      now(),
      cap,
    );
    if (!row)
      fail(
        "PROJECT_UNAVAILABLE",
        "Project unavailable or permission denied.",
        404,
      );
    return { ...row, archived: !!row.archived };
  }
  // Every mutation is a single D1 batch. The owner's compare-and-swap guard
  // serializes project writes, grant changes, revocation, quotas and deletion.
  // A CHECK failure rolls the entire batch back; retries recompute live access.
  async mutate<T>(a: Actor, run: (w: Write) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const owner = await this.owner(a),
        c = await this.connection(a),
        guard = randomUUID();
      const w: Write = {
        statements: [],
        owner,
        label: c?.label || owner.name,
        actorId: a.connectionId || a.userId,
      };
      const result = await run(w);
      const queries = [
        this.q(
          "INSERT INTO site_guards(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM site_owners WHERE id=? AND stamp=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM site_connections WHERE id=? AND owner_id=? AND status!='revoked' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN 1 ELSE 0 END)",
          guard,
          a.userId,
          owner.stamp,
          a.connectionId || null,
          a.connectionId || null,
          a.userId,
        ),
        ...w.statements,
        this.q("UPDATE site_owners SET stamp=stamp+1 WHERE id=?", a.userId),
        this.q("DELETE FROM site_guards WHERE id=?", guard),
      ];
      try {
        await this.db.batch(queries);
        return result;
      } catch (e) {
        if (!String(e).includes("site_guard_check")) throw e;
      }
    }
    return fail(
      "BUSY",
      "Another change is in progress. Retry with the same request key.",
      409,
    );
  }
  record(
    w: Write,
    p: string,
    kind: string,
    version: number,
    payload: any,
    id: string = randomUUID(),
    created = now(),
  ) {
    w.statements.push(
      this.q(
        "INSERT INTO site_records(id,project_id,kind,version,payload,created_at) VALUES(?,?,?,?,?,?)",
        id,
        p,
        kind,
        version,
        JSON.stringify(payload),
        created,
      ),
    );
    return { id, project_id: p, version, ...payload, created_at: created };
  }
  event(
    w: Write,
    p: string,
    op: string,
    version = 0,
    recordId: string | null = null,
  ) {
    this.record(w, p, "events", version, {
      actor_id: w.actorId,
      actor: w.label,
      operation: op,
      record_id: recordId,
    });
  }
  measure(w: Write, a: Actor, kind: string, p: string | null = null) {
    w.statements.push(
      this.q(
        "INSERT INTO site_measures(id,owner_id,project_id,kind,created_at) VALUES(?,?,?,?,?)",
        randomUUID(),
        a.userId,
        p,
        kind,
        now(),
      ),
    );
  }
  async capacity(a: Actor, extra: number, newProject = false) {
    const r = await this.first(
      "SELECT count(*) n,coalesce(sum(storage_bytes),0) bytes FROM site_projects WHERE owner_id=?",
      a.userId,
    );
    if (newProject && r.n >= this.limits.MAX_PROJECTS)
      fail("PROJECT_LIMIT", "Project limit reached.", 413);
    if (r.bytes + extra > this.limits.MAX_STORAGE_BYTES)
      fail(
        "STORAGE_LIMIT",
        "Export and remove unneeded projects before adding data.",
        413,
      );
  }
  decode(r: any) {
    if (!r) return null;
    const { payload, kind: _kind, ...rest } = r;
    return { ...rest, ...JSON.parse(payload) };
  }
  async revision(p: string, version: number) {
    const r = this.decode(
      await this.first(
        "SELECT * FROM site_records WHERE project_id=? AND kind='revisions' AND version=?",
        p,
        version,
      ),
    );
    if (!r) fail("REVISION_UNAVAILABLE", "Revision unavailable.", 404);
    return r;
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
    return this.mutate(a, async (w) => {
      await this.capacity(a, size(v.context), true);
      const id = randomUUID(),
        created = now();
      const p = {
        id,
        owner_id: a.userId,
        name: v.name,
        description: v.description,
        version: 1,
        archived: false,
        storage_bytes: size(v.context),
        created_at: created,
        updated_at: created,
      };
      w.statements.push(
        this.q(
          "INSERT INTO site_projects(id,owner_id,name,description,version,storage_bytes,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)",
          id,
          a.userId,
          v.name,
          v.description,
          p.storage_bytes,
          created,
          created,
        ),
      );
      this.record(w, id, "revisions", 1, {
        context: v.context,
        author: w.label,
        actor_id: w.actorId,
        summary: "Project created",
      });
      this.event(w, id, "project_created", 1);
      this.measure(w, a, "project_created", id);
      return p;
    });
  }
  async listProjects(a: Actor, offset = 0, limit = 20) {
    await this.owner(a);
    await this.connection(a);
    const rows = await this.all(
      `SELECT p.* FROM site_projects p WHERE p.owner_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM site_grants g JOIN site_connections c ON c.id=g.connection_id WHERE g.project_id=p.id AND c.id=? AND c.status!='revoked' AND c.expires_at>? AND EXISTS(SELECT 1 FROM json_each(g.capabilities) WHERE value='read'))) ORDER BY p.updated_at DESC,p.id LIMIT ? OFFSET ?`,
      a.userId,
      a.connectionId || null,
      a.connectionId || null,
      now(),
      limit + 1,
      offset,
    );
    return page(
      rows.map((p) => ({ ...p, archived: !!p.archived })),
      offset,
      limit,
    );
  }
  async context(a: Actor, p: string, version?: number, concise = false) {
    const project = await this.access(a, p),
      r = await this.revision(p, version || project.version);
    await this.access(a, p);
    return {
      project,
      revision: concise
        ? {
            ...r,
            context: undefined,
            preview: formatHandoff(
              {
                projectName: project.name,
                context: r.context,
                version: r.version,
                creator: r.author,
                createdAt: r.created_at,
              },
              true,
            ),
            fullDetailTool: "cove_get_context with detail=full",
          }
        : r,
    };
  }
  conflict(p: any, expected: number) {
    if (p.version !== expected)
      fail(
        "VERSION_CONFLICT",
        "Your saved base has changed. Inspect changes and explicitly retry.",
        409,
        {
          currentVersion: p.version,
          changesPath: `/api/projects/${p.id}/changes?from=${expected}&to=${p.version}`,
        },
      );
  }
  async replay(w: Write, p: string, op: string, key: string, v: unknown) {
    const r = await this.first(
      "SELECT * FROM site_retries WHERE actor_id=? AND project_id=? AND operation=? AND request_key=? AND expires_at>?",
      w.actorId,
      p,
      op,
      key,
      now(),
    );
    if (r) {
      if (r.fingerprint !== hash(v))
        fail(
          "IDEMPOTENCY_MISMATCH",
          "This request key was used with different content.",
          409,
        );
      return JSON.parse(r.result);
    }
  }
  remember(
    w: Write,
    p: string,
    op: string,
    key: string,
    v: unknown,
    result: unknown,
  ) {
    w.statements.push(
      this.q(
        "INSERT INTO site_retries(actor_id,project_id,operation,request_key,fingerprint,result,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(actor_id,project_id,operation,request_key) DO UPDATE SET fingerprint=excluded.fingerprint,result=excluded.result,expires_at=excluded.expires_at",
        w.actorId,
        p,
        op,
        key,
        hash(v),
        JSON.stringify(result),
        new Date(Date.now() + 604800000).toISOString(),
      ),
    );
  }
  async update(a: Actor, p: string, input: unknown) {
    const v = updateSchema.parse(input);
    return this.mutate(a, async (w) => {
      const project = await this.access(a, p, "write"),
        old = await this.replay(w, p, "update", v.requestKey, v);
      if (old) return old;
      this.conflict(project, v.expectedVersion);
      if (project.version >= this.limits.MAX_REVISIONS)
        fail("REVISION_LIMIT", "Export and create a successor project.", 413);
      await this.capacity(a, size(v.context));
      const version = project.version + 1,
        r = this.record(w, p, "revisions", version, {
          context: v.context,
          author: w.label,
          actor_id: w.actorId,
          summary: v.summary,
        });
      w.statements.push(
        this.q(
          "UPDATE site_projects SET version=?,storage_bytes=storage_bytes+?,updated_at=? WHERE id=?",
          version,
          size(v.context),
          now(),
          p,
        ),
      );
      this.event(w, p, "context_saved", version, r.id);
      this.measure(w, a, "context_saved", p);
      const result = { id: r.id, projectId: p, version };
      this.remember(w, p, "update", v.requestKey, v, result);
      return result;
    });
  }
  async restore(
    a: Actor,
    p: string,
    version: number,
    expectedVersion: number,
    requestKey: string,
  ) {
    this.human(a);
    const r = await this.context(a, p, version);
    return this.update(a, p, {
      context: r.revision.context,
      expectedVersion,
      requestKey,
      summary: `Restored revision ${version}`,
    });
  }
  async createHandoff(a: Actor, p: string, input: unknown) {
    const v = handoffInput.parse(input);
    return this.mutate(a, async (w) => {
      const project = await this.access(a, p, "handoff"),
        old = await this.replay(w, p, "handoff", v.requestKey, v);
      if (old) return old;
      this.conflict(project, v.expectedVersion);
      const count = await this.first(
        "SELECT count(*) n FROM site_records WHERE project_id=? AND kind='handoffs'",
        p,
      );
      if (count.n >= 1000) fail("HANDOFF_LIMIT", "Handoff limit reached.", 413);
      if (
        v.supersedesId &&
        !(await this.first(
          "SELECT id FROM site_records WHERE id=? AND project_id=? AND kind='handoffs'",
          v.supersedesId,
          p,
        ))
      )
        fail("INVALID_HANDOFF", "Replacement must belong to this project.");
      const r = await this.revision(p, project.version);
      const snapshot: Snapshot = {
        projectName: project.name,
        context: r.context,
        version: r.version,
        creator: w.label,
        createdAt: now(),
      };
      await this.capacity(a, size(snapshot));
      const h = this.record(w, p, "handoffs", r.version, {
        snapshot,
        supersedes_id: v.supersedesId || null,
      });
      w.statements.push(
        this.q(
          "UPDATE site_projects SET storage_bytes=storage_bytes+? WHERE id=?",
          size(snapshot),
          p,
        ),
      );
      this.event(w, p, "handoff_created", r.version, h.id);
      this.measure(w, a, "handoff_created", p);
      const result = { id: h.id, projectId: p, version: r.version };
      this.remember(w, p, "handoff", v.requestKey, v, result);
      return result;
    });
  }
  async handoff(a: Actor, p: string, id: string) {
    const project = await this.access(a, p),
      r = this.decode(
        await this.first(
          "SELECT * FROM site_records WHERE id=? AND project_id=? AND kind='handoffs'",
          id,
          p,
        ),
      );
    if (!r) fail("INVALID_HANDOFF", "Handoff unavailable.", 404);
    const latest = await this.revision(p, project.version);
    await this.access(a, p);
    if (a.connectionId)
      await this.mutate(a, async (w) => {
        await this.access(a, p);
        this.measure(w, a, "handoff_retrieved_mcp", p);
        this.event(w, p, "handoff_retrieved", r.version, id);
      });
    return {
      ...r,
      currentVersion: project.version,
      hasNewerChanges: project.version > r.version,
      changes: changes(r.snapshot.context, latest.context),
      concise: formatHandoff(r.snapshot, true),
      full: formatHandoff(r.snapshot),
    };
  }
  async listRecords(
    a: Actor,
    p: string,
    kind: "revisions" | "handoffs" | "events",
    offset = 0,
    limit = 20,
  ) {
    await this.access(a, p);
    const rows = await this.all(
      "SELECT * FROM site_records WHERE project_id=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      p,
      kind,
      limit + 1,
      offset,
    );
    await this.access(a, p);
    return page(
      rows.map((r) => {
        const v = this.decode(r);
        delete v.context;
        delete v.snapshot;
        return v;
      }),
      offset,
      limit,
    );
  }
  async compare(a: Actor, p: string, from: number, to: number) {
    const b = await this.context(a, p, from),
      n = await this.context(a, p, to);
    return {
      from,
      to,
      changes: changes(b.revision.context, n.revision.context),
    };
  }
  async search(a: Actor, query: string, offset = 0, limit = 20) {
    await this.owner(a);
    await this.connection(a);
    const rows = await this.all(
      `SELECT p.*,json_extract(r.payload,'$.context.summary') summary FROM site_projects p JOIN site_records r ON r.project_id=p.id AND r.kind='revisions' AND r.version=p.version WHERE p.owner_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM site_grants g JOIN site_connections c ON c.id=g.connection_id WHERE g.project_id=p.id AND c.id=? AND c.status!='revoked' AND c.expires_at>? AND EXISTS(SELECT 1 FROM json_each(g.capabilities) WHERE value='read'))) AND instr(lower(p.name||' '||p.description||' '||r.payload),lower(?))>0 ORDER BY p.updated_at DESC,p.id LIMIT ? OFFSET ?`,
      a.userId,
      a.connectionId || null,
      a.connectionId || null,
      now(),
      query,
      limit + 1,
      offset,
    );
    return page(
      rows.map((p) => ({
        ...p,
        archived: !!p.archived,
        summary: p.summary?.slice(0, 300),
      })),
      offset,
      limit,
    );
  }
  async connectionActor(userId: string, clientId: string) {
    const c = await this.first(
      "SELECT * FROM site_connections WHERE owner_id=? AND client_id=?",
      userId,
      clientId,
    );
    if (!c)
      fail(
        "ACCESS_DENIED",
        "Approve this assistant and project grants in Cove.",
        403,
      );
    const a = { userId, connectionId: c.id };
    await this.mutate(a, async (w) => {
      w.statements.push(
        this.q(
          "UPDATE site_connections SET status='active',last_activity=? WHERE id=?",
          now(),
          c.id,
        ),
      );
    });
    return a;
  }
  async saveConnection(a: Actor, input: unknown) {
    this.human(a);
    const v = connectionInput.parse(input);
    if (new Set(v.grants.map((g) => g.projectId)).size !== v.grants.length)
      fail("INVALID_GRANTS", "Each project may appear only once.");
    return this.mutate(a, async (w) => {
      const existing = await this.first(
        "SELECT * FROM site_connections WHERE owner_id=? AND client_id=?",
        a.userId,
        v.clientId,
      );
      if (existing?.status === "revoked")
        fail(
          "CONNECTION_REVOKED",
          "Register a fresh OAuth client after revocation.",
          409,
        );
      const count = await this.first(
        "SELECT count(*) n FROM site_connections WHERE owner_id=?",
        a.userId,
      );
      if (!existing && count.n >= 100)
        fail("CONNECTION_LIMIT", "Connection limit reached.", 413);
      for (const g of v.grants) await this.access(a, g.projectId);
      const id = existing?.id || randomUUID();
      w.statements.push(
        this.q(
          "INSERT INTO site_connections(id,owner_id,client_id,label,status,expires_at,created_at) VALUES(?,?,?,?,'pending',?,?) ON CONFLICT(owner_id,client_id) DO UPDATE SET label=excluded.label,expires_at=excluded.expires_at",
          id,
          a.userId,
          v.clientId,
          v.label,
          existing && v.expiresInDays === undefined
            ? existing.expires_at
            : new Date(
                Date.now() + (v.expiresInDays ?? 30) * 86400000,
              ).toISOString(),
          now(),
        ),
        this.q("DELETE FROM site_grants WHERE connection_id=?", id),
      );
      for (const g of v.grants) {
        w.statements.push(
          this.q(
            "INSERT INTO site_grants(connection_id,project_id,capabilities) VALUES(?,?,?)",
            id,
            g.projectId,
            JSON.stringify([...new Set(g.capabilities)]),
          ),
        );
        this.event(w, g.projectId, "grants_changed");
      }
      return { id };
    });
  }
  async listConnections(a: Actor) {
    this.human(a);
    await this.owner(a);
    const rows = await this.all(
      "SELECT * FROM site_connections WHERE owner_id=? ORDER BY created_at DESC",
      a.userId,
    );
    return Promise.all(
      rows.map(async (c) => ({
        ...c,
        grants: (
          await this.all(
            "SELECT * FROM site_grants WHERE connection_id=?",
            c.id,
          )
        ).map((g) => ({
          projectId: g.project_id,
          capabilities: JSON.parse(g.capabilities),
        })),
      })),
    );
  }
  async revoke(a: Actor, id: string) {
    this.human(a);
    return this.mutate(a, async (w) => {
      if (
        !(await this.first(
          "SELECT id FROM site_connections WHERE id=? AND owner_id=?",
          id,
          a.userId,
        ))
      )
        fail("ACCESS_DENIED", "Connection unavailable.", 404);
      w.statements.push(
        this.q("UPDATE site_connections SET status='revoked' WHERE id=?", id),
        this.q("DELETE FROM site_grants WHERE connection_id=?", id),
      );
      this.ledger(w, "connection_revoked", id);
      return { revoked: true };
    });
  }
  ledger(w: Write, kind: string, target: string) {
    w.statements.push(
      this.q(
        "INSERT INTO site_ledger(id,kind,target_id,created_at) VALUES(?,?,?,?)",
        randomUUID(),
        kind,
        target,
        now(),
      ),
    );
  }
  async export(a: Actor, p: string) {
    this.human(a);
    const project = await this.access(a, p);
    const records = await this.all(
      "SELECT * FROM site_records WHERE project_id=? ORDER BY version,created_at,id",
      p,
    );
    await this.access(a, p);
    const out = {
      schemaVersion: 1 as const,
      project: {
        id: p,
        name: project.name,
        description: project.description,
        archived: project.archived,
      },
      revisions: records
        .filter((r) => r.kind === "revisions")
        .map((row) => {
          const r = this.decode(row);
          return {
            id: r.id,
            version: r.version,
            context: r.context,
            author: r.author,
            summary: r.summary,
            createdAt: r.created_at,
          };
        }),
      handoffs: records
        .filter((r) => r.kind === "handoffs")
        .map((row) => {
          const h = this.decode(row);
          return {
            id: h.id,
            version: h.version,
            snapshot: h.snapshot,
            supersedesId: h.supersedes_id,
          };
        }),
    };
    if (size(out) > 8388608)
      fail(
        "RESPONSE_LIMIT",
        "Export exceeds 8 MiB. Contact the operator.",
        413,
      );
    return out;
  }
  async import(a: Actor, input: unknown) {
    this.human(a);
    const v = exportSchema.parse(input);
    if (v.revisions.length > 1000)
      fail("REVISION_LIMIT", "Import exceeds the revision limit.", 413);
    return this.mutate(a, async (w) => {
      const bytes =
        v.revisions.reduce((n, r) => n + size(r.context), 0) +
        v.handoffs.reduce((n, h) => n + size(h.snapshot), 0);
      await this.capacity(a, bytes, true);
      const id = randomUUID(),
        created = now(),
        ids = new Map<string, string>();
      const remap = (old: string) => {
        if (!ids.has(old)) ids.set(old, randomUUID());
        return ids.get(old)!;
      };
      const remapContext = (ctx: Context) => {
        const out = structuredClone(ctx);
        for (const key of [
          "constraints",
          "decisions",
          "notes",
          "completedWork",
          "nextSteps",
          "openQuestions",
          "sources",
          "artifacts",
        ] as const)
          for (const e of out[key]) {
            e.id = remap(e.id);
            if ("sourceIds" in e) e.sourceIds = e.sourceIds.map(remap);
          }
        return out;
      };
      w.statements.push(
        this.q(
          "INSERT INTO site_projects(id,owner_id,name,description,version,archived,storage_bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
          id,
          a.userId,
          v.project.name,
          v.project.description,
          v.revisions.length,
          Number(v.project.archived),
          bytes,
          created,
          created,
        ),
      );
      for (const r of v.revisions)
        this.record(
          w,
          id,
          "revisions",
          r.version,
          {
            context: remapContext(r.context),
            author: `Imported: ${r.author}`.slice(0, 200),
            actor_id: `import:${randomUUID()}`,
            summary: r.summary,
          },
          remap(r.id),
          r.createdAt,
        );
      for (const h of v.handoffs)
        this.record(
          w,
          id,
          "handoffs",
          h.version,
          {
            snapshot: {
              ...h.snapshot,
              context: remapContext(h.snapshot.context),
              creator: `Imported: ${h.snapshot.creator}`.slice(0, 200),
            },
            supersedes_id: h.supersedesId ? remap(h.supersedesId) : null,
          },
          remap(h.id),
        );
      this.event(w, id, "project_imported", v.revisions.length);
      return { id, version: v.revisions.length };
    });
  }
  async archive(a: Actor, p: string, archived: boolean) {
    this.human(a);
    return this.mutate(a, async (w) => {
      await this.access(a, p);
      w.statements.push(
        this.q(
          "UPDATE site_projects SET archived=? WHERE id=?",
          Number(archived),
          p,
        ),
      );
      this.event(w, p, archived ? "project_archived" : "project_unarchived");
      return { archived };
    });
  }
  async deleteProject(a: Actor, p: string, confirmation: string) {
    this.human(a);
    return this.mutate(a, async (w) => {
      const project = await this.access(a, p);
      if (confirmation !== project.name)
        fail("CONFIRMATION_REQUIRED", "Type the project name to delete it.");
      this.ledger(w, "project_deleted", p);
      w.statements.push(this.q("DELETE FROM site_projects WHERE id=?", p));
      return { deleted: true };
    });
  }
  async deleteAccount(a: Actor) {
    this.human(a);
    return this.mutate(a, async (w) => {
      this.ledger(w, "account_deleted", a.userId);
      w.statements.push(
        this.q("DELETE FROM site_owners WHERE id=?", a.userId),
        this.q("DELETE FROM user WHERE id=?", a.userId),
      );
      return { deleted: true };
    });
  }
  async usage(a: Actor) {
    this.human(a);
    await this.owner(a);
    return {
      observations: await this.all(
        "SELECT kind,count(*) count FROM site_measures WHERE owner_id=? GROUP BY kind ORDER BY kind",
        a.userId,
      ),
      storageBytes: (
        await this.first(
          "SELECT coalesce(sum(storage_bytes),0) bytes FROM site_projects WHERE owner_id=?",
          a.userId,
        )
      ).bytes,
      limits: this.limits,
      interpretation:
        "Retrieval does not prove successful continuation or different model providers.",
    };
  }
  async recordCopy(a: Actor, p: string, id: string) {
    this.human(a);
    return this.mutate(a, async (w) => {
      await this.access(a, p);
      if (
        !(await this.first(
          "SELECT id FROM site_records WHERE id=? AND project_id=? AND kind='handoffs'",
          id,
          p,
        ))
      )
        fail("INVALID_HANDOFF", "Handoff unavailable.", 404);
      this.measure(w, a, "copy_success_reported", p);
      this.event(w, p, "copy_success_reported", 0, id);
      return { recorded: true };
    });
  }
  async connectionFailure(a: Actor) {
    this.human(a);
    return this.mutate(a, async (w) => {
      this.measure(w, a, "connection_setup_failure");
      return { recorded: true };
    });
  }
}
