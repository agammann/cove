# Release readiness

**Local release candidate. Public launch readiness has not been established.**

Implemented and tested: real verified accounts and password recovery; private PostgreSQL projects; structured context and references; immutable revisions/handoffs; comparison/restoration; transactionally enforced conflicts and idempotency; independent OAuth bindings and project grants; seven official SDK MCP tools; manual copy; search; validated import/export; archive/deletion; usage metadata; restart persistence and disposable backup restoration.

The automated suite passes 14 domain, real database, OAuth/SDK and security regression tests. The Playwright journey passes at desktop and mobile sizes. Production builds and container preparation are included; see container-verification.json for the actual container smoke result. No production domain or service has been deployed.

Two security findings were fixed before source publication: configuration disclosure through usage metadata and optional SMTP TLS. Tests assert a public quota allowlist and rejection of an SMTP server without TLS before AUTH or message data. The original scan has partial coverage and is preserved under security; it is not a claim that the final source has no possible vulnerabilities.

External verification still required:

1. Approve and configure a production host, HTTPS domain, real SMTP delivery, restricted database credentials and secret storage.
2. Configure encrypted backups, independent durable deletion ledger replication, retention and alerts. Prove ledger currency before reopening any restored customer data.
3. Verify actual Codex and ChatGPT assistant hosts against that endpoint, including saves, handoffs, separate grants and revocation. SDK fixtures are not real assistant hosts.
4. Run acceptance checks on the deployed image, including email recovery, secure cookies, recovery isolation and ordinary user concurrency. Capacity assumptions are not load testing.

Known first release limitations:

1. JSON export/import is bounded to 8 MiB. Larger existing projects require the documented operator assisted export and explicit division before browser import. Streaming export is not implemented.
2. Revoked owner/client bindings cannot be reused. Reconnecting requires a new OAuth client registration; a host with a fixed client identifier needs additional lifecycle support.
3. A connection label does not verify a provider. Retrieval and copying do not establish successful continuation. No user pilot results are claimed.
4. Metadata is excluded from the document byte quota. Operators must monitor total database growth and maintain documented expiration/retention jobs.
5. The optional Vite preview is for frontend work; use the canonical API origin on port 4317 for OAuth, email links and MCP setup.

Deferred by the product brief: teams, orchestration, scheduling, external writes, credential vaults, billing, vectors, marketplaces and native mobile applications.

No source implementation is blocked by a missing model key. Deployment approval, infrastructure configuration and live host access remain the external gates.
