import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { database } from "./db.js";
if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const { db, pool } = database(process.env.DATABASE_URL);
try {
  await migrate(db, { migrationsFolder: "packages/database/migrations" });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
