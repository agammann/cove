// Maintainer-only: generate SQL against an empty disposable database, then review and commit it.
import { writeFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { database } from "../packages/database/db.js";
import { makeAuth } from "../apps/api/auth.js";
import { readConfig } from "../apps/api/config.js";
process.loadEnvFile(".env");
const c = readConfig();
const { pool } = database(c.DATABASE_URL);
try {
  const auth = makeAuth(pool, c);
  const m = await getMigrations(auth.options);
  await writeFile(
    "packages/database/auth-generated.sql",
    await m.compileMigrations(),
  );
} finally {
  await pool.end();
}
