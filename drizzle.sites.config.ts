import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/sites/schema.ts",
  out: "./drizzle",
});
