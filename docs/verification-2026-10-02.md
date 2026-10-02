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

The local sign-in uses synthetic identity headers on loopback. The public checks below use the owner's actual signed-in account. Production recovery, off-host backups and participant usability are outside this evidence.

## Public app and native Codex host

The public Sites deployment at `https://cove-context.alx21.chatgpt.site` was checked with Chrome 154.0.8037.95 and the native Codex 0.159.2 app-server on Windows. A temporary MCP configuration pointed at `/api/mcp`; the user's persistent MCP configuration was unchanged. The native host completed OAuth through Chrome and its loopback callback, reported `connected` with OAuth authentication, and discovered all seven tools. The consent grant covered only the fictional **Verification — October 2** project, with read, update and handoff permissions for seven days.

The browser-created project and revision 2 were retrieved through the native host. All seven tools returned real hosted data:

- Project listing and search returned only the granted fixture.
- Full context and the browser-created handoff preserved the saved goal and next step.
- Updating with `expectedVersion: 2` saved revision 3. Repeating the same request key and payload returned the same revision ID, without another revision.
- A fresh request key with the stale base returned `VERSION_CONFLICT` and current version 3. Reusing the successful key with changed content returned `IDEMPOTENCY_MISMATCH`.
- Creating a revision 3 handoff and repeating its request returned the same handoff ID. The new handoff recorded the old handoff as superseded.
- The original handoff still held revision 2's complete snapshot and copy formats, while reporting current version 3 and the two changed fields. The new handoff matched revision 3 exactly.
- A request for an unavailable, ungranted project ID returned `PROJECT_UNAVAILABLE` without project data.
- Chrome showed the saved revision, completed-work entry and both handoffs after the host writes.

The fixture's saved revision ID was `34321feb-21ab-41ba-a516-3155a90bfaf2`; its revision 3 handoff was `e308bddf-a09e-41e5-a886-e4c9309c9ff3`. These are private fixture identifiers, not public sharing links.

These checks exercised the native host's OAuth and MCP execution path through its app-server tool-call interface. They did not run a model-generated save/continue conversation, install a persistent Codex connection, or verify ChatGPT's assistant connection. ChatGPT account sign-in to the website is separate from ChatGPT acting as an MCP client. Refresh and revocation were covered by the separately documented SDK checks, not by this native-host session.
