import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  contextSchema,
  emptyContext,
  formatHandoff,
  changes,
} from "../packages/shared/context.js";
import { exportSchema } from "../packages/domain/service.js";
import { readConfig } from "../apps/api/config.js";
describe("bounded untrusted documents", () => {
  it("rejects oversized fields, duplicate IDs, missing sources, executable URLs and unknown fields", () => {
    const c = emptyContext();
    expect(
      contextSchema.safeParse({ ...c, goal: "x".repeat(4001) }).success,
    ).toBe(false);
    const e = { id: randomUUID(), text: "a", kind: "decision", sourceIds: [] };
    expect(contextSchema.safeParse({ ...c, decisions: [e, e] }).success).toBe(
      false,
    );
    expect(
      contextSchema.safeParse({
        ...c,
        decisions: [{ ...e, sourceIds: [randomUUID()] }],
      }).success,
    ).toBe(false);
    expect(
      contextSchema.safeParse({
        ...c,
        sources: [
          { id: randomUUID(), label: "bad", location: "javascript:alert(1)" },
        ],
      }).success,
    ).toBe(false);
    expect(contextSchema.safeParse({ ...c, admin: true }).success).toBe(false);
  });
  it("announces concise omissions and keeps full details", () => {
    const c = {
      ...emptyContext(),
      summary: "s".repeat(1000),
      notes: Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        text: `note ${i}`,
        kind: "decision" as const,
        sourceIds: [],
      })),
    };
    const s = {
      projectName: "test",
      context: c,
      version: 1,
      creator: "test",
      createdAt: new Date().toISOString(),
    };
    expect(formatHandoff(s, true)).toContain("2 additional entries");
    expect(formatHandoff(s, true)).toContain("Current state shortened");
    expect(formatHandoff(s)).toContain("note 4");
    expect(changes(emptyContext(), c).map((x) => x.field)).toEqual([
      "summary",
      "notes",
    ]);
  });
  it("rejects invalid import relationships and injected grants", () => {
    const v = {
      schemaVersion: 1,
      project: {
        id: randomUUID(),
        name: "test",
        description: "",
        archived: false,
      },
      revisions: [
        {
          id: randomUUID(),
          version: 1,
          context: emptyContext(),
          author: "test",
          summary: "initial",
          createdAt: new Date().toISOString(),
        },
      ],
      handoffs: [],
    };
    expect(exportSchema.safeParse(v).success).toBe(true);
    expect(exportSchema.safeParse({ ...v, grants: [] }).success).toBe(false);
    expect(
      exportSchema.safeParse({
        ...v,
        revisions: [{ ...v.revisions[0], version: 3 }],
      }).success,
    ).toBe(false);
  });
  it("fails closed on insecure production settings", () => {
    const env = {
      NODE_ENV: "production",
      APP_URL: "https://cove.example",
      DATABASE_URL: "postgresql://test",
      BETTER_AUTH_SECRET: "a".repeat(48),
      SMTP_HOST: "smtp.example",
      SMTP_USER: "test",
      SMTP_PASSWORD: "test",
      SMTP_FROM: "cove@example.com",
    };
    expect(() => readConfig(env)).not.toThrow();
    expect(() => readConfig({ ...env, DEMO_AUTH: "true" })).toThrow();
    expect(() =>
      readConfig({ ...env, APP_URL: "http://cove.example" }),
    ).toThrow();
    expect(() => readConfig({ ...env, SMTP_PASSWORD: "" })).toThrow();
  });
});
