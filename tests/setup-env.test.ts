import { afterEach, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/setup-env.mjs", import.meta.url),
);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function fixture(template = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cove-env-"));
  directories.push(directory);
  if (template)
    fs.writeFileSync(
      path.join(directory, ".env.example"),
      "SESSION_SECRET=replace-with-at-least-32-random-characters\nKEEP=value\n",
    );
  return directory;
}
function run(directory: string, preload?: string) {
  const args = preload
    ? ["--import", pathToFileURL(preload).href, script]
    : [script];
  return spawnSync(process.execPath, args, {
    cwd: directory,
    encoding: "utf8",
    timeout: 5000,
  });
}

it("creates a secret once and preserves an existing environment without its template", () => {
  const directory = fixture();
  const first = run(directory);
  expect(first.status, first.stderr).toBe(0);
  const file = path.join(directory, ".env");
  const bytes = fs.readFileSync(file, "utf8");
  expect(bytes).toMatch(/^SESSION_SECRET=[A-Za-z0-9_-]{64}\nKEEP=value\n$/);
  expect(first.stdout).not.toContain(bytes.split("\n")[0].split("=")[1]);
  if (process.platform !== "win32")
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  fs.unlinkSync(path.join(directory, ".env.example"));
  expect(run(directory).stdout).toContain("Existing .env preserved.");
  expect(fs.readFileSync(file, "utf8")).toBe(bytes);
});

it("preserves a file created between the initial check and exclusive creation", () => {
  const directory = fixture();
  const preload = path.join(directory, "competing-writer.mjs");
  fs.writeFileSync(
    preload,
    `
import fs from 'node:fs';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
const original = crypto.randomBytes;
crypto.randomBytes = (...args) => { fs.writeFileSync('.env', 'competing environment\\n'); return original(...args); };
syncBuiltinESMExports();
`,
  );
  const result = run(directory, preload);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Existing .env preserved.");
  expect(fs.readFileSync(path.join(directory, ".env"), "utf8")).toBe(
    "competing environment\n",
  );
});

it("preserves linked and dangling entries without opening or changing their targets", (context) => {
  const directory = fixture(false);
  const target = path.join(directory, "target");
  const file = path.join(directory, ".env");
  try {
    fs.symlinkSync(target, file, "file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      context.skip();
      return;
    }
    throw error;
  }
  expect(run(directory).status).toBe(0);
  expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
  expect(fs.existsSync(target)).toBe(false);
  fs.writeFileSync(target, "keep linked target");
  expect(run(directory).status).toBe(0);
  expect(fs.readFileSync(target, "utf8")).toBe("keep linked target");
});

it("does not create an empty environment when its template is missing", () => {
  const directory = fixture(false);
  expect(run(directory).status).toBe(1);
  expect(fs.existsSync(path.join(directory, ".env"))).toBe(false);
});

it("preserves an existing directory or junction at the environment name", () => {
  const directory = fixture(false);
  const target = path.join(directory, "linked-directory");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "keep.txt"), "keep directory contents");
  fs.symlinkSync(
    target,
    path.join(directory, ".env"),
    process.platform === "win32" ? "junction" : "dir",
  );
  expect(run(directory).status).toBe(0);
  expect(fs.readFileSync(path.join(target, "keep.txt"), "utf8")).toBe(
    "keep directory contents",
  );
});

it("concurrent setup invocations produce one complete environment", async () => {
  const directory = fixture();
  const results = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise<number | null>((resolve, reject) => {
          const child = spawn(process.execPath, [script], {
            cwd: directory,
            stdio: "ignore",
          });
          child.once("error", reject);
          child.once("exit", resolve);
        }),
    ),
  );
  expect(results).toEqual(Array(8).fill(0));
  expect(fs.readFileSync(path.join(directory, ".env"), "utf8")).toMatch(
    /^SESSION_SECRET=[A-Za-z0-9_-]{64}\nKEEP=value\n$/,
  );
});

it("a failed descriptor write never removes another writer's replacement", () => {
  const directory = fixture();
  const preload = path.join(directory, "failed-writer.mjs");
  fs.writeFileSync(
    preload,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
fs.writeFileSync = (target, ...args) => {
  if (typeof target === 'number') {
    fs.renameSync('.env', '.failed-creation');
    write('.env', 'replacement environment\\n');
    throw Error('Controlled write failure');
  }
  return write(target, ...args);
};
syncBuiltinESMExports();
`,
  );
  const result = run(directory, preload);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Could not finish .env");
  expect(fs.readFileSync(path.join(directory, ".env"), "utf8")).toBe(
    "replacement environment\n",
  );
});
