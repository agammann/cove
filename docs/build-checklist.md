# Cove first release

Status: implemented local release candidate. Public source publication is authorized. Public service deployment, billing and model API calls are outside this release activity.

1. Complete: repository, PostgreSQL migrations, real email/password authentication, recovery, ownership and navigation.
2. Complete: validated context, atomic immutable revisions, optimistic concurrency, idempotency, comparisons, restoration and activity.
3. Complete: immutable private handoffs, both copy formats, newer context warnings and manual workflow.
4. Complete locally: OAuth assistant bindings, project grants, remote MCP, save/continue instructions and two independent authenticated SDK clients. Real assistant host verification remains pending.
5. Complete: PostgreSQL search, validated portability, archive/deletion, onboarding and owner usage metadata.
6. Complete locally: container build, operating/recovery instructions, verified disposable restore, privacy documentation and responsive interface. Actual production infrastructure still requires configuration and verification.
7. Passed: lint, type checking, 14 domain/integration/security tests, full Playwright journey and production build. See verification.md for container smoke status and the exact scope of evidence.

Security review found two issues before publication. Both were fixed and regression tested. The preserved scan report describes the original source snapshot, while security/README.md records remediation.

Use docs/verification.md for evidence, docs/decisions.md for decisions, and docs/release-readiness.md for remaining gates. A checkbox requires working code and appropriate checks.
