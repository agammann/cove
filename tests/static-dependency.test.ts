import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

describe("static file dependency compatibility", () => {
  let root: string;
  const app = Fastify();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cove-static-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "sample.txt"), "static fixture");
    await app.register(staticFiles, { root, wildcard: true });
  });

  afterAll(async () => {
    await app.close();
    if (!root) return;
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !basename(root).startsWith("cove-static-")
    )
      throw new Error("Refusing to remove an unexpected fixture path");
    await rm(root, { recursive: true, force: true });
  });

  it("serves a nested asset through Fastify", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/sample.txt" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("static fixture");
  });
});
