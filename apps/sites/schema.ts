import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const owners = sqliteTable("site_owners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stamp: integer("stamp").notNull().default(0),
});
export const projects = sqliteTable(
  "site_projects",
  {
    id: text("id").primaryKey(),
    owner: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    version: integer("version").notNull(),
    archived: integer("archived").notNull().default(0),
    bytes: integer("storage_bytes").notNull(),
    created: text("created_at").notNull(),
    updated: text("updated_at").notNull(),
  },
  (t) => [index("site_projects_owner").on(t.owner, t.updated)],
);
export const records = sqliteTable(
  "site_records",
  {
    id: text("id").primaryKey(),
    project: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    payload: text("payload").notNull(),
    created: text("created_at").notNull(),
  },
  (t) => [
    index("site_records_project").on(t.project, t.kind, t.version),
    uniqueIndex("site_revision_unique")
      .on(t.project, t.version)
      .where(sql`${t.kind} = 'revisions'`),
  ],
);
export const connections = sqliteTable(
  "site_connections",
  {
    id: text("id").primaryKey(),
    owner: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    client: text("client_id").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull(),
    expires: text("expires_at").notNull(),
    activity: text("last_activity"),
    created: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("site_connection_binding").on(t.owner, t.client)],
);
export const grants = sqliteTable(
  "site_grants",
  {
    connection: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    project: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    capabilities: text("capabilities").notNull(),
  },
  (t) => [primaryKey({ columns: [t.connection, t.project] })],
);
export const retries = sqliteTable(
  "site_retries",
  {
    actor: text("actor_id").notNull(),
    project: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    op: text("operation").notNull(),
    key: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: text("result").notNull(),
    expires: text("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.actor, t.project, t.op, t.key] })],
);
export const measures = sqliteTable(
  "site_measures",
  {
    id: text("id").primaryKey(),
    owner: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    project: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    created: text("created_at").notNull(),
  },
  (t) => [index("site_measures_owner").on(t.owner)],
);
export const guards = sqliteTable(
  "site_guards",
  { id: text("id").primaryKey(), ok: integer("ok").notNull() },
  (t) => [check("site_guard_check", sql`${t.ok} = 1`)],
);
export const ledger = sqliteTable("site_ledger", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  target: text("target_id").notNull(),
  created: text("created_at").notNull(),
});
