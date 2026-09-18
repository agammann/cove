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

Run these commands in a terminal:

```sh
git clone https://github.com/agammann/cove.git
cd cove
pnpm install --frozen-lockfile
node scripts/setup-env.mjs
docker compose up -d --wait
pnpm db:migrate
pnpm build:local
pnpm start
```

The setup script creates `.env` with a random session secret and preserves an existing file. Compose starts PostgreSQL and Mailpit. Database data persists in the named `cove-data` volume. These defaults are for local development; see [operations](operations.md) for an independent production installation.

Keep that terminal running and open `http://localhost:4317` on the same computer. Create an account with a password of at least 12 characters. Open `http://localhost:8025` for Mailpit and follow the verification email's link. Mailpit captures development email; it does not deliver it to your real inbox. Password recovery uses it too.

Create a project and follow the [first handoff walkthrough](getting-started.md#create-your-first-project). Local accounts are separate from the public app's ChatGPT accounts. There is no seeded administrator.

To stop, press Ctrl+C in the server terminal and run `docker compose stop`. To return later, run `docker compose up -d --wait` and `pnpm start` if the local build is still present. Avoid `docker compose down -v`: it removes the database volume.

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

Start `pnpm start` in one terminal. In a second terminal, from the repository root, run:

```sh
pnpm test:browser
pnpm scan:secrets
pnpm audit --audit-level=moderate
```

`pnpm test` includes PostgreSQL integration tests, so it needs a reachable database and permission to create disposable test databases. The default local development user has this permission. Those tests create uniquely named databases and remove only their own databases afterward.

The browser suite expects the local app on port 4317 and Mailpit on port 8025. It creates synthetic accounts and exercises account deletion; a failed run may leave its test account for debugging. On Linux CI, install browser system dependencies with `pnpm exec playwright install --with-deps chromium`.

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

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Cannot connect to Docker | Start Docker's Linux engine, then rerun `docker compose up -d --wait`. |
| Database connection refused | Check `docker compose ps` and `docker compose logs db`; confirm `.env` uses the local port 55439. |
| Database password mismatch | An existing volume keeps its original credentials. Match `.env` to that installation instead of deleting the volume. |
| Sign in says email is unverified | Open Mailpit on port 8025 and follow the verification message. |
| `dist/apps/api/main.js` is missing | Stop the server, run `pnpm build:local`, then `pnpm start`. |
| The local page shows ChatGPT sign in | You have Sites frontend assets. Rebuild with `pnpm build:local`. |
| Browser test cannot connect | Keep `pnpm start` running on port 4317 with PostgreSQL and Mailpit healthy. |
| Sites fixture reports a missing table | Confirm the matching Wrangler config and all three initial migrations were applied to the same local database. |

## Maintainer checks

The [CI workflow](../.github/workflows/ci.yml) also builds the Docker image and builds Sites after the local browser journey. Recovery and container exercises are separate:

```sh
node scripts/backup-verify.mjs
node scripts/verify-container.mjs
docker build -t cove:0.1.0 .
```

The recovery exercise restarts this Compose project's database and leaves an ignored local dump. Run it when no one is actively using that local instance. Read the [backup and recovery procedure](operations.md) first. These checks do not establish production disaster recovery or real external assistant host compatibility.
