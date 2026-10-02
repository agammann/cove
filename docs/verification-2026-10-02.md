# October 2, 2026 UTC verification

These checks use fictional data. Local environment: Windows, Node 24.19.0, pnpm 11.19.0 and Playwright Chromium 153.0.8010.12.

- Frozen dependency installation, lint, TypeScript and the Sites production build passed.
- Twelve domain, security regression and Sites tests passed. The Sites suite includes two official SDK clients against an in-process Worker fixture.
- The compiled Worker and actual local D1 passed the browser journey: project creation, editing, saved context, concise/full handoff copying, account cleanup and desktop/mobile layout.
- Two independent official MCP SDK 2.0.0 clients completed actual HTTP registration, S256 PKCE, consent and separate project grants against that compiled Worker. All seven tools returned the expected project, revision, handoff, search and change data. A read-only client could not write; the saved revision stayed at version 2. Revoking one live connection rejected further calls without disabling the other client.
- The initial dependency audit reported 24 advisories. Updating Wrangler, Fastify, Nodemailer and compatible transitive packages reduced the audit to zero advisories at all severity levels. The release-age exceptions name only the patched Wrangler and its exact Miniflare dependency.
- The source credential-pattern check passed. Its bounded patterns do not guarantee the absence of secrets.

Run `node scripts/verify-sites-mcp.mjs` against the documented local Sites fixture to repeat the compiled HTTP check. It creates and deletes only its own fictional account and records results in `test-results/cove-sites-mcp.json`. OAuth registration rate limits remain enabled; a cooldown was required after repeated exploratory runs.

GitHub Actions passed 21 tests including actual PostgreSQL and OAuth integration, the email sign-in and recovery browser journey, and the compiled Sites browser and HTTP MCP checks. A separate disposable Compose job restored a fictional saved revision and pinned handoff, compared complete project/history contents, revoked restored grants, and verified persistence after a database restart. The production container passed fresh migration, health and frontend checks, Host validation, non-root/read-only startup, restart, and rejection of insecure demo settings. See [the verified run](https://github.com/agammann/cove/actions/runs/36962954567) and [the workflow](https://github.com/agammann/cove/actions/workflows/ci.yml).

The local sign-in uses synthetic identity headers on loopback. Live ChatGPT sign-in and a native Codex or ChatGPT assistant interaction still require the owner's account connection. SDK protocol checks do not establish those host integrations. Production recovery, off-host backups and participant usability are outside this evidence.
