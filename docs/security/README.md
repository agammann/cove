# Security remediation record

The generated [scan report](report.md), [manifest](scan-manifest.json), [findings](findings.json) and [coverage](coverage.json) preserve the original audit snapshot. They are intentionally unchanged after remediation. Read this record for the release source status.

1. Configuration disclosure, originally high: fixed by constructing a fresh frozen object containing only MAX_PROJECTS, MAX_REVISIONS and MAX_STORAGE_BYTES. The response also explicitly selects those values. A constructor regression uses synthetic extra secrets, and an authenticated HTTP test verifies the exact response keys.
2. SMTP TLS downgrade, originally medium: fixed by requiring STARTTLS in production when implicit TLS is disabled. A local controlled SMTP fixture advertises authentication without TLS; the transport rejects it before AUTH, MAIL, RCPT or DATA. Local Mailpit remains a development fixture.

Both regressions passed with the full 14 test suite. The build had only local synthetic accounts before these fixes and no production deployment. Any operator who independently ran an older vulnerable version should rotate the credentials it exposed and invalidate affected authentication authority.

The original scan coverage is partial and no exhaustive new scan of the final source is claimed. Targeted source validation and regression tests cover the fixes. Production topology, real mail delivery, independently durable deletion records and live assistant hosts require external verification.

The scan tool reported 9,487,274 total tokens across four tasks, including 8,834,048 cached input tokens, 9,450,495 input tokens and 36,779 output tokens. This is the tool's rollout accounting, which spans the build conversation and scan workers; it is not a scan only billing estimate. Measured coverage was reported complete for token accounting, separately from partial source audit coverage.
