import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
export function database(url: string) {
  const pool = new Pool({
    connectionString: url,
    max: 12,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
  });
  pool.on("error", () => {
    /* Idle connections are replaced after database recovery. Readiness reports availability. */
  });
  return { pool, db: drizzle(pool, { schema }) };
}
