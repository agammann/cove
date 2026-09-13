import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from 'node:path';
await mkdir("dist/server", { recursive: true });
await build({
  entryPoints: ["apps/sites/worker.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["workerd", "worker", "browser"],
  mainFields: ["module", "main"],
  external: ["node:*", "cloudflare:*", "bun:sqlite"],
  packages: "bundle",
  minify: true,
});
await cp("dist/web", "dist/client", { recursive: true });
const webOutput=resolve('dist/web');
if(dirname(webOutput)!==resolve('dist'))throw Error('Unexpected web output');
await rm(webOutput,{recursive:true,force:true});
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (!manifest.project_id) throw Error("Site registration missing");
await mkdir('.sites-runtime',{recursive:true});
await writeFile(
  ".sites-runtime/wrangler.json",
  JSON.stringify(
    {
      name: "cove-context",
      main: "../dist/server/index.js",
      compatibility_date: "2026-05-15",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        directory: "../dist/client",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: true,
      },
      d1_databases: [
        {
          binding: "DB",
          database_name: "cove-local-sites",
          database_id: "local-cove-sites",
        },
      ],
      vars: {
        APP_URL: "http://localhost:4318",
        BETTER_AUTH_SECRET: "local-sites-fixture-keep-loopback-only-0123456789",
      },
    },
    null,
    2,
  ),
);
