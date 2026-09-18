# Verification

**Historical PostgreSQL verification record.** The results below describe the September 10 local release. For the later hosted app, see [Sites verification](sites.md#verification-on-september-13-2026). Use [GitHub Actions](https://github.com/agammann/cove/actions/workflows/ci.yml) for current automated results and [local development](development.md) for current commands.

Verified locally on September 10, 2026, with UTC evidence timestamps on September 11. Environment: Windows, Node 24.19.0, pnpm 11.19.0, PostgreSQL 17.6 in Docker, Playwright Chromium and official MCP SDK 2.0.0.

1. `pnpm check`: passed lint, TypeScript, 14 tests and production build. Three test files cover domain validation, real PostgreSQL transactions, authentication/OAuth/MCP and security regressions.
2. Database tests: passed cross account direct/history/handoff/search isolation, read only grants, concurrent saves, duplicate retries, payload mismatch rejection, immutable SQL triggers, stale handoff rejection, newer changes, restoration as a new revision, import isolation and graph deletion.
3. MCP: two actual SDK clients completed native OAuth registration, S256 PKCE and separate bearer credentials. Client A saved and published; client B retrieved and updated; a stale A save failed. Revoking A denied later operations through its existing client while B remained usable. Seven tools were discovered. These are synthetic SDK fixtures, not model provider hosts.
4. `pnpm test:browser`: passed the complete browser journey in 25.1 seconds on the final recorded run. It covers real signup and Mailpit verification, editing, concise/full copy, conflict draft preservation and retry, old snapshot warnings, comparison, JSON export/import, browser OAuth consent, grants/revocation, saved malicious text rendered literally, password recovery invalidating the old session, project/account deletion and mobile overflow. The OAuth callback page is an explicitly simulated test callback. See browser-verification.json.
5. `node scripts/backup-verify.mjs`: passed a PostgreSQL custom dump restore into a disposable database, restoring 12 revisions. Deletion reconciliation, removal of restored authentication/grants and actual database restart persistence passed. The disposable database was removed. See recovery-verification.json. This is a local restore exercise, not proof of an offsite production backup.
6. `pnpm scan:secrets`: passed bounded credential patterns and environment file exclusion. `pnpm audit --audit-level=moderate`: no known vulnerabilities found on this run. An earlier esbuild advisory was addressed by the lockfile override; this does not audit container OS packages or guarantee absence of vulnerabilities.
7. Docker build and `scripts/verify-container.mjs`: passed fresh database migration, production health and frontend, canonical Host validation, nonroot read only execution, restart and insecure demo rejection. Disposable resources were removed. The machine readable result is container-verification.json. HTTPS certificate issuance and real SMTP delivery remain external checks.
8. Codex Security: the original source audit completed with one high and one medium finding. Both were fixed and tested before source upload. The generated report and canonical artifacts are in security/. Coverage is partial; directory output changed during the scan, so its sealed report applies to the original snapshot. The independent architecture result arrived after finalization and confirmed the documented configuration and recovery prerequisites. No new finding was introduced by that architecture report.

Security regressions specifically verify that extra credential fields cannot survive runtime quota projection and that production SMTP sends neither AUTH nor message data when TLS is unavailable. No real credentials were used in those tests.

Visual review: generated concept and actual desktop/mobile screenshots were inspected. The navy navigation, restrained teal controls and readable goal/state/decision/next action arrangement were retained. The implementation adds required history/settings navigation and further context sections. Mobile sections stack and tabs scroll within their container. Screenshots show synthetic fixture content, not customer data.

Remaining evidence limits: no public deployment, real assistant host integration, production email delivery, offsite backup job, user pilot, broad accessibility certification or load test is claimed. GitHub Actions is configured; its result must be checked separately after publication.

Official references checked on 2026-09-08:
- https://better-auth.com/docs/plugins/mcp
- https://better-auth.com/docs/plugins/oauth-provider
- https://better-auth.com/docs/integrations/fastify
- https://github.com/modelcontextprotocol/typescript-sdk
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

Installed package APIs and executed integration tests establish the local protocol behavior described above. Exact package versions are pinned in the lockfile.
