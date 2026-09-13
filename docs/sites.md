# Cove on OpenAI Sites

**Live:** https://cove-context.alx21.chatgpt.site. Public publication succeeded on September 13, 2026. The live browser journey verified ChatGPT sign in, project creation, a saved context revision, handoff creation and copying, persistence after a full page reload, and archiving the synthetic verification project. Anonymous requests to private APIs were denied, including an attempted spoof of the dispatch identity headers. The live MCP address is `https://cove-context.alx21.chatgpt.site/api/mcp`; its authorization challenge and resource metadata were verified. A real external assistant host has not yet been connected.

The remote D1 parser rejected a `CASE ... END` expression inside the initially unapplied integrity trigger migration. Equivalent `SELECT RAISE ... WHERE` statements retained the safeguards and deployed successfully. The previously applied base and auth migrations were unchanged. Direct workspace links now use an explicit SPA fallback. The `/api/mcp` address avoids the platform's reserved `/mcp` route.

The Sites edition runs the application, API, authentication sessions, OAuth provider, MCP endpoint, and persistent database on Sites. It requires no separately hosted PostgreSQL server, SMTP service, or model API key. Public website access does not make projects public. Visitors sign in with ChatGPT before opening their own workspace.

## Architecture

`apps/sites/worker.ts` provides the HTTP entrypoint. `auth.ts` exchanges the Sites dispatcher's authenticated identity headers for a Better Auth session. These headers are trusted only behind the Sites dispatcher; a local development server must bind to loopback. Sites owns the outer ChatGPT sign in flow. Cove owns its sessions, private projects and assistant permissions.

`service.ts` implements bounded project operations against D1. A per owner stamp, guard constraint, and atomic D1 batch serialize mutations, including grant changes, quotas, and idempotency records. Revision and handoff updates are forbidden by database triggers. Handoffs must match their pinned revision. Account and project deletion use cascading foreign keys. SQL migrations in `drizzle/` are packaged in `dist/.openai/drizzle`.

Native OAuth dynamic client registration and PKCE are supported. Each assistant also needs an active Cove connection with explicit project grants. Revocation and expiry are checked during operations. The Sites edition does not enable the PostgreSQL edition's remote Client ID Metadata Document fetching plugin. Search uses bounded literal text matching rather than PostgreSQL full text ranking. No live third party assistant host compatibility is implied by the SDK integration tests.

Local PostgreSQL accounts are separate from ChatGPT identities. Export projects from the local installation, then import them into the hosted workspace if desired. Import creates new IDs. No private local data is uploaded automatically.

## Configuration and builds

The checked in `.openai/hosting.json` contains the Site identity and logical `DB` binding. Sites runtime variables provide the canonical `APP_URL` and secret `BETTER_AUTH_SECRET`. Secrets never belong in the repository or deployment archive.

Run `pnpm build` for Sites. It removes only the verified generated `dist` directory, creates the Worker and client assets, and copies the manifest and migrations. Local Wrangler configuration and SQLite state live under ignored `.sites-runtime`, outside the deployment output. Run `pnpm build:local` for the original Fastify/PostgreSQL distribution.

For a local Sites fixture, build, apply the three `drizzle/*.sql` files to `DB` with Wrangler using `.sites-runtime/wrangler.json`, then run Wrangler dev with that config, `--local --ip 127.0.0.1 --port 4318`. `node scripts/verify-sites-browser.mjs` checks that fixture and deletes its synthetic account. Never run its synthetic identity flow against a public deployment.

## Verification on September 13, 2026

Lint, TypeScript checking, the production Sites build, five Sites tests, four shared domain tests, and two security regression tests passed. The Sites tests cover account isolation, optimistic concurrency and retries, immutable handoffs, export/import, cascaded deletion, grant revocation, and two official MCP SDK clients using real Better Auth DCR and PKCE with an in process HTTP fixture.

The browser journey also passed against actual local workerd and D1: desktop and mobile rendering, project creation, context editing and saving, concise and full handoffs, and synthetic account deletion. See `sites-browser-verification.json` and `design/` screenshots. The local sign in fixture uses synthetic dispatch headers; it does not establish live ChatGPT sign in success.

The eight original PostgreSQL integration tests could not run on the local machine because the database on port 55439 was stopped. They subsequently passed in GitHub Actions alongside the 11 other tests. That run reached the final homepage assertion in the browser journey, where it still expected the old headline. The assertion was updated to the redesigned heading. Historical container results remain in their original reports; consult the latest Actions run for the current complete workflow result.

## Operation

Use the workspace export control for portable project copies. Apply future schema changes through new migrations; do not edit migrations that have already reached production. A source rollback does not undo database migrations or restore deleted data. Sites platform backup and recovery guarantees have not been exercised here, so do not interpret local export/import checks as a production disaster recovery exercise.

The visual redesign draws on 25 reviewed website references, documented in [design research](design-research.md). It uses original generated artwork and Cove's own layouts and copy.
