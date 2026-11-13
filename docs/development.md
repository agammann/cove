# Local development and testing

[Documentation](README.md) · [Repository](../README.md)

## Choose the distribution

| | PostgreSQL local app | Sites local fixture |
| --- | --- | --- |
| Server | Fastify and Node.js | Wrangler and workerd |
| Database | PostgreSQL in Docker | Local D1/SQLite |
| Sign in | Email/password with Mailpit | Synthetic identity only for local verification |
| Build | `pnpm build:local` | `pnpm build` |
| Local origin | `http://localhost:4317` | `http://localhost:4318` |
| MCP path | `/mcp` | `/api/mcp` |

Use the PostgreSQL app for an ordinary local account and full manual workflow. The Sites fixture is for testing the hosted implementation. To use real ChatGPT sign in, open the [public app](https://cove-context.alx21.chatgpt.site).

Both builds use `dist`. Stop the running server before switching builds, then rebuild the distribution you intend to run. `pnpm start` requires `pnpm build:local`; the Sites build does not produce the Node server entrypoint.

## Set up the PostgreSQL app

Install Git, Node.js 24, pnpm 11.19.0, and Docker with Compose and a running Linux container engine. Use `node --version`, `pnpm --version`, and `docker compose version` to check your tools. Ports 4317, 55439, 1025, and 8025 must be available.

The following commands are **only for a fresh installation**. Before running them, identify all existing Cove hosts, projects, volume mappings, backups and independent security ledgers. Stop potential writers and storage changes. If an existing database may contain data, preserve it and follow a separately reviewed migration plan; do not initialize a replacement. Unset inherited `DATABASE_URL`, `POSTGRES_PASSWORD`, `COVE_DOMAIN`, `COVE_PG18_FRESH_INSTALL` and all `DOCKER_*`, `COMPOSE_*` and `PG*` variables throughout the setup, and remove Docker, Compose and PostgreSQL selectors from `.env`. Do not use automatic Compose overrides. These rules prevent a later command from selecting a different host or database after the helper exits.

Run these commands in a terminal:

```sh
git clone https://github.com/agammann/cove.git
cd cove
pnpm install --frozen-lockfile
node scripts/setup-env.mjs
node scripts/confirm-postgres18-fresh.mjs local
docker compose -p cove up -d --wait mail
pnpm db:migrate
pnpm build:local
pnpm start
```

The setup script creates `.env` with independent random session and PostgreSQL credentials and preserves an existing file. For this checkout, the helper initializes a separate PostgreSQL 18 volume only after an explicit confirmation that this is a fresh installation. It validates that the default local URL and password match, checks the local Docker project, and refuses a populated legacy volume or nonempty target. It cannot discover a custom project, bind mount, external volume, remote database or an independent security ledger. First inventory those sources and stop all possible writers and storage changes. If any Cove database may contain data, keep its existing source, mapping, credentials and verified backups and use an installation-specific migration plan; do not initialize a new database as a substitute. Data for a confirmed fresh setup persists in `cove-data-18`; the old `cove-data` volume is mounted read-only and retained. See [the migration rehearsal](postgres18-rehearsal.md) and [operations](operations.md).

The commands and credential behavior above describe this checkout. The published [v1.0.2 source archive](https://github.com/agammann/cove/releases/tag/v1.0.2) predates the generated database credential. Verify its checksum as described in [v1 delivery](v1.md#source-release), extract it, and follow the documentation included in that archive. No new release is implied by these checkout instructions.

Keep that terminal running and open `http://localhost:4317` on the same computer. Create an account with a password of at least 12 characters. Open `http://localhost:8025` for Mailpit and follow the verification email's link. Mailpit captures development email; it does not deliver it to your real inbox. Password recovery uses it too.

Create a project and follow the [first handoff walkthrough](getting-started.md#create-your-first-project). Local accounts are separate from the public app's ChatGPT accounts. There is no seeded administrator.

To stop, press Ctrl+C in the server terminal and run `docker compose -p cove stop`. To return later, run `docker compose -p cove up -d --wait` and `pnpm start` if the local build is still present. Avoid `docker compose down -v`: it removes database volumes.

If fresh initialization is interrupted, preserve both volumes and logs; do not remove the attempt record or retry the fresh command. If initialization finished before the helper was interrupted, normal startup checks the cluster identifier and completion marker. A missing marker or populated legacy volume blocks startup and requires an installation-specific review. The marker is not proof of complete data or a backup.

### Rotate an existing local PostgreSQL password

An existing PostgreSQL 17 `.env` and `cove-data` volume keep their previous password. Updating the source does not rotate either one. The PostgreSQL 17 commands below apply to the pre-18 [source revision 53ef201](https://github.com/agammann/cove/tree/53ef2012d684de3b65605e2705a3479b216b4472), which includes the backup helper, and its matching Compose file; do not run them from this PostgreSQL 18 checkout. The published v1.0.2 archive predates that helper: retain its own source and mapping, and prepare an installation-specific backup and rotation procedure rather than assuming the helper exists or switching revisions without review. These steps are for the default local Compose project and its loopback database; if you use a different project name, external volume, bind mount, remote database, or Compose override, first identify the actual database and use a tailored procedure. Never run these commands against the production Compose project.

Stop the Cove app and all other database writers. Before any Compose command, ensure inherited `DATABASE_URL`, `POSTGRES_PASSWORD`, all `DOCKER_*`, `COMPOSE_*` and `PG*` variables are unset for this terminal throughout the procedure. Remove such Docker, Compose and PostgreSQL selectors from `.env` as well. Do not use an automatic Compose override file. Check `docker context inspect --format '{{json .Endpoints.docker.Host}}'`: proceed only with a local `unix://` or `npipe://` endpoint, never a remote Docker context.

Keep a private copy of the existing `.env` outside the checkout, with access restricted to the operator. In `.env`, add `POSTGRES_PASSWORD` equal to the **current** password already in `DATABASE_URL`; preserve all other values. This lets the new Compose file address the existing database without changing its password. The standard old and generated passwords use letters, digits, `_` and `-`; other credentials or URL query options require a tailored procedure. Confirm the expected existing `cove_cove-data` volume with `docker volume inspect cove_cove-data` and inspect `docker compose -p cove ps -a db`. If the expected volume or mapping is absent, stop and identify the installation; do not create a new database. Then start that same service if needed with `docker compose -p cove up -d --no-recreate --wait db`.

Create a new private backup at an absolute path that does not already exist, for example `node scripts/backup-local.mjs /secure/cove-before-rotation.dump` on Linux or `node scripts/backup-local.mjs C:\secure\cove-before-rotation.dump` on Windows. Choose an appropriately protected directory; Windows users must set its access controls. The helper refuses to overwrite a file or use inherited selectors, requires a local Docker context, and checks both the Compose `db` published loopback port and PostgreSQL cluster identity against `DATABASE_URL` before and after the dump. These checks do not prove the contents are the intended data. It checks that the resulting archive can be listed, which is not a restore test. Restore it into a **separate isolated database** and verify the expected project history before proceeding; do not restore over the running database. The separate `backup-verify.mjs` script writes fixed paths and restarts the database, so do not use it as a substitute for this pre-rotation backup.

Generate a new password with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and retain it privately until the change is complete. Run `docker compose -p cove exec db psql -U cove -d cove`. At the `psql` prompt, enter `\password cove` and provide the new password twice, then exit with `\q`. Update both `POSTGRES_PASSWORD` and the password portion of `DATABASE_URL` in `.env` to that same value; the generated alphabet is URL safe. Run `docker compose -p cove up -d --force-recreate --wait db`, then verify the app can connect before restarting other writers. Keep the old environment copy and verified backup until the change has been confirmed.

If interrupted or the new connection fails, keep writers stopped. The database role may have changed even if `.env` has not. Restore the private old environment copy to `.env` and add its old database password as `POSTGRES_PASSWORD` so Compose can address the existing service; this edit does not change the role. Confirm the expected existing volume and project again, then, if needed, start the existing database with `docker compose -p cove up -d --no-recreate --wait db`. Open `docker compose -p cove exec db psql -U cove -d cove` and use `\password cove` to set the role back to the old password, then recreate the database service as above. Verify the old connection and saved data before restarting writers. This password rollback preserves database writes; restoring a backup would instead revert data to its backup time and requires the separate [isolated recovery procedure](operations.md#isolated-recovery).

For a fresh PostgreSQL 18 installation, the same backup, prompt-based role change and interrupted-rotation precautions apply, but first identify the actual `cove_cove-data-18` volume and current cluster rather than the PostgreSQL 17 volume. Run the commands from this checkout, keep the existing `POSTGRES_PASSWORD` and `DATABASE_URL` consistent until changing the role, and use `scripts/backup-local.mjs` with a new private destination. Verify an isolated restore and the latest independent deletion/revocation ledger before rotating. If the current mapping, credentials or ledger cannot be established, stop and use a tailored procedure; do not initialize a new database.

## Edit the app

After the first local build, use `pnpm dev` in place of `pnpm start` to watch API changes. For frontend edits, rebuild with `pnpm build:local` or run `pnpm dev:web` in a second terminal and open the preview address Vite prints.

Use the canonical origin on port 4317 for acceptance testing, email links, OAuth consent, and MCP. The optional Vite preview is for frontend work. Rebuild the local app before validating frontend changes on port 4317.

## Run the PostgreSQL checks

With dependencies installed, `.env` configured, and Compose services healthy:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build:local
pnpm exec playwright install chromium
```

The browser journey makes many requests in one session. Stop the ordinary local server before running it, then start a disposable test server with `RATE_LIMIT=10000`. This changes only that test process; the application default remains 120 requests per minute and authentication keeps its separate limit.

In PowerShell:

```powershell
$env:RATE_LIMIT = '10000'
pnpm start
```

In a POSIX shell, use `RATE_LIMIT=10000 pnpm start`. Keep this test server running. In a second terminal, from the repository root, run:

```sh
pnpm test:browser
pnpm scan:secrets
pnpm audit --audit-level=moderate
```

`pnpm test` includes PostgreSQL integration tests, so it needs a reachable database and permission to create disposable test databases. The default local development user has this permission. Those tests create uniquely named databases and remove only their own databases afterward.

The browser suite expects the local app on port 4317 and Mailpit on port 8025. It creates synthetic accounts and exercises account deletion; a failed run may leave its test account for debugging. Stop the test server afterward; in PowerShell, run `Remove-Item Env:RATE_LIMIT` in its terminal before starting an ordinary server again. On Linux CI, install browser system dependencies with `pnpm exec playwright install --with-deps chromium`.

`pnpm check` runs lint, typechecking, all unit/integration tests, then the **Sites** build. It requires PostgreSQL for the tests and must be followed by `pnpm build:local` before starting the local server or its browser suite.

## Build and check Sites

With Node.js 24, pnpm 11.19.0, and repository dependencies installed, these checks do not require PostgreSQL:

```sh
pnpm lint
pnpm typecheck
pnpm test:sites
pnpm build
```

The build creates `dist/server`, `dist/client`, the Sites manifest and migrations, plus an ignored `.sites-runtime/wrangler.json` for local testing. Building does not publish a website. The checked in Site identity belongs to the existing Cove deployment; another installation needs its own registration and runtime configuration. See [Sites operations](sites.md).

For a fresh local D1 fixture, apply the migrations in order from the repository root:

```sh
pnpm exec wrangler d1 execute DB --local --config .sites-runtime/wrangler.json --file drizzle/0000_sticky_juggernaut.sql
pnpm exec wrangler d1 execute DB --local --config .sites-runtime/wrangler.json --file drizzle/0001_sites_auth.sql
pnpm exec wrangler d1 execute DB --local --config .sites-runtime/wrangler.json --file drizzle/0002_integrity.sql
pnpm exec wrangler dev --local --config .sites-runtime/wrangler.json --ip 127.0.0.1 --port 4318
```

These direct SQL commands initialize a fresh fixture; they do not track migration application. Do not reapply an already applied file when reusing the local database. Apply only new migrations in order. Never reset an existing database just to bypass an error.

Keep Wrangler running. In another terminal:

```sh
pnpm exec playwright install chromium
node scripts/verify-sites-browser.mjs
```

This script exercises desktop/mobile rendering, saving context, handoff copying, and deletion of its synthetic account. It updates `docs/sites-browser-verification.json` and the screenshots in `docs/design`; review those changes before committing. The fixture uses synthetic identity headers and a development secret. Keep it bound to loopback, and never expose it through a tunnel or use its sign in flow against production.

Run `node scripts/verify-sites-mcp.mjs` against the same local Worker to verify all seven tools over actual HTTP. Two independent SDK clients complete PKCE, save and retrieve a pinned handoff, and check read-only grants and live revocation. The check creates and removes its own fictional local account and writes `test-results/cove-sites-mcp.json`. Repeated OAuth registrations are subject to the application's rate limits; wait for the normal cooldown before rerunning. This protocol test does not establish a ChatGPT or Codex host connection.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Cannot connect to Docker | Start Docker's Linux engine, then rerun `docker compose up -d --wait`. |
| Database connection refused | Check `docker compose ps` and `docker compose logs db`; confirm `.env` uses the local port 55439. |
| Database password mismatch | An existing volume keeps its original credentials. Follow the local password rotation steps above; keep the volume intact. |
| Sign in says email is unverified | Open Mailpit on port 8025 and follow the verification message. |
| `dist/apps/api/main.js` is missing | Stop the server, run `pnpm build:local`, then `pnpm start`. |
| The local page shows ChatGPT sign in | You have Sites frontend assets. Rebuild with `pnpm build:local`. |
| Browser test cannot connect | Keep `pnpm start` running on port 4317 with PostgreSQL and Mailpit healthy. |
| Sites fixture reports a missing table | Confirm the matching Wrangler config and all three initial migrations were applied to the same local database. |

## Maintainer checks

The [CI workflow](../.github/workflows/ci.yml) builds both distributions and runs the compiled Sites browser/MCP checks. A separate disposable Compose job verifies backup restoration and production container startup. You can repeat those operational checks locally:

```sh
node scripts/backup-verify.mjs
docker build -t cove:1.0.2 .
node scripts/verify-container.mjs
```

The recovery exercise restarts this Compose project's database and leaves an ignored local dump. Run it when no one is actively using that local instance. Read the [backup and recovery procedure](operations.md) first. These checks do not establish production disaster recovery or real external assistant host compatibility.
