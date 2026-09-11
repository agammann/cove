import { readFile } from "node:fs/promises";
import { Pool } from "pg";
if (process.argv[2] !== "--confirm-isolated-recovery")
  throw new Error(
    "Usage: DATABASE_URL=<isolated restored DB> node scripts/reconcile-recovery.mjs --confirm-isolated-recovery <latest-ledger.json>. Keep service ingress blocked.",
  );
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const ledger = JSON.parse(await readFile(process.argv[3], "utf8"));
if (
  !Array.isArray(ledger) ||
  ledger.some(
    (r) =>
      !["account_deleted", "project_deleted", "connection_revoked"].includes(
        r.kind,
      ) ||
      typeof r.target_id !== "string" ||
      r.target_id.length > 200,
  )
)
  throw new Error("Invalid ledger");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
try {
  await db.query("BEGIN");
  for (const r of ledger) {
    if (r.kind === "account_deleted")
      await db.query('DELETE FROM "user" WHERE id=$1', [r.target_id]);
    if (r.kind === "project_deleted")
      await db.query("DELETE FROM projects WHERE id=$1", [r.target_id]);
    if (r.kind === "connection_revoked")
      await db.query("UPDATE connections SET status='revoked' WHERE id=$1", [
        r.target_id,
      ]);
  }
  // Recovery deliberately revokes every restored session and assistant grant,
  // including records absent from a delayed security-ledger export.
  await db.query('DELETE FROM "session"');
  await db.query('DELETE FROM "oauthAccessToken"');
  await db.query('DELETE FROM "oauthRefreshToken"');
  await db.query('DELETE FROM "oauthConsent"');
  await db.query("DELETE FROM verification");
  await db.query("UPDATE connections SET status='revoked'");
  await db.query("DELETE FROM grants");
  await db.query("COMMIT");
  console.log(
    "Recovery reconciled; all restored authentication sessions and assistant grants revoked. Keep ingress blocked until deletion ledger currency is established.",
  );
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  db.release();
  await pool.end();
}
