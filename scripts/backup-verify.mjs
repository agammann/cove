// Dumps and restarts Cove's local database; restores into a disposable database.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { URL } from "node:url";
import { setTimeout } from "node:timers";
process.loadEnvFile(".env");
const base = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error(
    "This verification script requires a loopback development database",
  );
const dbName = `cove_restore_${Date.now()}`;
if (!/^cove_restore_\d+$/.test(dbName))
  throw new Error("Invalid disposable database name");
const admin = new Pool({ connectionString: base.href });
admin.on("error", () => {});
const run = (args, input) =>
  new Promise((resolve, reject) => {
    const p = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    let err = "";
    p.stdout.on("data", (b) => chunks.push(b));
    p.stderr.on("data", (b) => (err += b));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err)),
    );
    p.stdin.end(input);
  });
let target;
let result;
try {
  const before = await admin.query("SELECT count(*)::int n FROM revisions");
  const dump = await run([
    "compose",
    "exec",
    "-T",
    "db",
    "pg_dump",
    "-U",
    "cove",
    "-d",
    "cove",
    "-Fc",
  ]);
  await mkdir("backups", { recursive: true });
  await writeFile("backups/verification.dump", dump);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await run(
    [
      "compose",
      "exec",
      "-T",
      "db",
      "pg_restore",
      "-U",
      "cove",
      "-d",
      dbName,
      "--exit-on-error",
      "--no-owner",
    ],
    dump,
  );
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  target = new Pool({ connectionString: url.href });
  target.on("error", () => {});
  const restored = await target.query("SELECT count(*)::int n FROM revisions");
  if (restored.rows[0].n !== before.rows[0].n)
    throw new Error("Restored revision count mismatch");
  // Exercise reconciliation using a synthetic deleted account that exists only in the restored copy.
  const synthetic = randomUUID();
  await target.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [synthetic, "Recovery test fixture", `${synthetic}@example.test`],
  );
  await writeFile(
    "backups/reconciliation.json",
    JSON.stringify([{ kind: "account_deleted", target_id: synthetic }]),
  );
  const ledger = JSON.parse(
    await readFile("backups/reconciliation.json", "utf8"),
  );
  await target.query("BEGIN");
  for (const r of ledger)
    await target.query('DELETE FROM "user" WHERE id=$1', [r.target_id]);
  await target.query('DELETE FROM "session"');
  await target.query('DELETE FROM "oauthAccessToken"');
  await target.query('DELETE FROM "oauthRefreshToken"');
  await target.query('DELETE FROM "oauthConsent"');
  await target.query("DELETE FROM verification");
  await target.query("UPDATE connections SET status='revoked'");
  await target.query("DELETE FROM grants");
  await target.query("COMMIT");
  if (
    (await target.query('SELECT 1 FROM "user" WHERE id=$1', [synthetic]))
      .rowCount
  )
    throw new Error("Deletion reconciliation failed");
  const fixtureId = randomUUID();
  await target.query(
    "INSERT INTO security_ledger(id,kind,target_id) VALUES($1,$2,$3)",
    [fixtureId, "persistence_fixture", fixtureId],
  );
  await target.end();
  target = new Pool({ connectionString: url.href });
  target.on("error", () => {});
  if (
    !(
      await target.query("SELECT 1 FROM security_ledger WHERE id=$1", [
        fixtureId,
      ])
    ).rowCount
  )
    throw new Error("Pool restart persistence failed");
  // Restart only Cove's explicitly named database container, not unrelated services.
  await run(["compose", "restart", "db"]);
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      await target.query("SELECT 1");
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (
    !ready ||
    !(
      await target.query("SELECT 1 FROM security_ledger WHERE id=$1", [
        fixtureId,
      ])
    ).rowCount
  )
    throw new Error("Database restart persistence failed");
  for (const table of [
    "session",
    "oauthAccessToken",
    "oauthRefreshToken",
    "oauthConsent",
    "verification",
    "grants",
  ]) {
    if (
      (await target.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0]
        .n !== 0
    )
      throw new Error("Restored authentication was not fully revoked");
  }
  if (
    (await target.query("SELECT count(*)::int n FROM revisions")).rows[0].n !==
    restored.rows[0].n
  )
    throw new Error("Project history changed after database restart");
  result = {
    date: new Date().toISOString(),
    backupFormat: "PostgreSQL custom",
    restoredRevisions: restored.rows[0].n,
    restore: "passed",
    deletedAccountReconciliation: "passed",
    allAccessRevokedOnRecovery: "passed",
    databaseRestartPersistence: "passed",
    disposableDatabaseRemoved: true,
  };
} finally {
  if (target) await target.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
await writeFile(
  "docs/recovery-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
