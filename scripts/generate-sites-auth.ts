import { getMigrations } from "better-auth/db/migration";
import { writeFileSync, readFileSync } from "node:fs";
import { sitesAuth } from "../apps/sites/auth.js";
import { TestDatabase } from "../tests/sites-database.js";
const auth = sitesAuth({
  DB: new TestDatabase(),
  APP_URL: "http://localhost:4318",
  BETTER_AUTH_SECRET: "migration-only-synthetic-secret-not-for-runtime",
  ASSETS: null as any,
});
const migrations = await getMigrations(auth.options);
writeFileSync(
  "drizzle/0001_sites_auth.sql",
  await migrations.compileMigrations(),
);
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
if (!journal.entries.some((e: any) => e.tag === "0001_sites_auth"))
  journal.entries.push({
    idx: 1,
    version: "6",
    when: Date.now(),
    tag: "0001_sites_auth",
    breakpoints: true,
  });
writeFileSync("drizzle/meta/_journal.json", JSON.stringify(journal, null, 2));
