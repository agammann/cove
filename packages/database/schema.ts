import {
  pgTable,
  text,
  uuid,
  integer,
  jsonb,
  timestamp,
  boolean,
  primaryKey,
  unique,
  foreignKey,
  bigint,
} from "drizzle-orm/pg-core";
import type { Context, Snapshot } from "../shared/context.js";
const utc = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
// Better Auth owns its separate tables; account IDs are its verified user IDs.
export const owners = pgTable("cove_owners", {
  id: text("id").primaryKey(),
  createdAt: utc("created_at"),
});
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  archived: boolean("archived").notNull().default(false),
  version: integer("version").notNull(),
  storageBytes: bigint("storage_bytes", { mode: "number" })
    .notNull()
    .default(0),
  createdAt: utc("created_at"),
  updatedAt: utc("updated_at"),
});
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    context: jsonb("context").$type<Context>().notNull(),
    author: text("author").notNull(),
    actorId: text("actor_id").notNull(),
    summary: text("summary").notNull(),
    createdAt: utc("created_at"),
  },
  (t) => [unique().on(t.projectId, t.version), unique().on(t.projectId, t.id)],
);
export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Snapshot>().notNull(),
    supersedesId: uuid("supersedes_id"),
    createdAt: utc("created_at"),
  },
  (t) => [
    unique().on(t.projectId, t.id),
    foreignKey({
      columns: [t.projectId, t.version],
      foreignColumns: [revisions.projectId, revisions.version],
    }),
    foreignKey({
      columns: [t.projectId, t.supersedesId],
      foreignColumns: [t.projectId, t.id],
    }),
  ],
);
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastActivity: timestamp("last_activity", { withTimezone: true }),
    createdAt: utc("created_at"),
  },
  (t) => [unique().on(t.ownerId, t.clientId)],
);
export const grants = pgTable(
  "grants",
  {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.projectId] })],
);
export const events = pgTable("events", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull(),
  actor: text("actor").notNull(),
  operation: text("operation").notNull(),
  version: integer("version"),
  recordId: uuid("record_id"),
  createdAt: utc("created_at"),
});
export const idempotency = pgTable(
  "idempotency",
  {
    actorId: text("actor_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.actorId, t.projectId, t.operation, t.requestKey],
    }),
  ],
);
export const measurements = pgTable("measurements", {
  id: uuid("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  connectionId: uuid("connection_id").references(() => connections.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
  createdAt: utc("created_at"),
});
// Contains only stable record IDs, never context or email. Export before recovery.
export const securityLedger = pgTable("security_ledger", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: utc("created_at"),
});
