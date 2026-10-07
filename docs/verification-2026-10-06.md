# October 6 verification

[Documentation](README.md) · [Cove v1](v1.md) · [MCP compatibility](mcp.md#host-compatibility-matrix)

These checks cover the existing public website's installed Codex plugin and the v1 source candidate based on repository commit `d176d1385096ebda12b6b5118011a3fedecb1381`. Dates refer to October 6 in America/Los_Angeles. The local source candidate received the version, dependency, documentation and source-release changes described in the [changelog](../CHANGELOG.md).

## Installed plugin and continuation

The native Cove connector in Codex used one explicitly authorized fictional project. It saved revision 5 from revision 4 and read back the exact submitted context. Retrying the same request returned the same revision. A stale request with expected revision 4 was rejected and preserved revision 5. The original context was restored as revision 6.

The handoff remained pinned to revision 5 after restoration and reported current revision 6 with newer changes present. A fresh assistant received only the project and handoff identifiers, then retrieved the handoff through the installed connector. It correctly used the two fictional details in the pinned snapshot and separately identified the later removal of one detail. It did not receive those facts in its starting prompt.

This establishes a bounded read-only continuation through the installed Codex connector. A separate ChatGPT web assistant connection was not exercised in this pass. No other project or real user account was changed.

## Source candidate

The source was reconstructed at the exact repository tree and each of its 122 tracked baseline file blobs was checked against GitHub's recorded hash before changes. A frozen pnpm 11.19.0 install passed on Node.js 24.19.0.

The candidate updates `@modelcontextprotocol/client` from 2.0.0 to 2.2.0 and overrides transitive Sharp 0.35.4 with 0.35.5. Those are the published patched versions for the [MCP client advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h) and [Sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). The MCP server and application frameworks retain their existing versions. The fresh full dependency audit reports zero advisories at every severity.

Typechecking, all 24 existing unit/integration tests, and both production builds passed. The tests include real disposable PostgreSQL databases and two independently authenticated OAuth SDK clients. The compiled Sites fixture passed desktop/mobile browsing, context saves, handoff copying, account deletion, and all seven tools over actual HTTP with separate grants and live revocation. Sites fixture sign in uses synthetic local headers; it is separate from real public website sign in.

The PostgreSQL newcomer workflow ran with fresh isolated Compose resources and fictional accounts. It passed account creation and Mailpit email verification, project creation, exact context readback, concise handoff copying, mobile layout, JSON download/import with preserved content and remapped IDs, API and database restart persistence, and account deletion. The default commands used separate fixture ports for this exercise.

An image built from the candidate passed fresh migrations, health and frontend checks, ordinary host validation, non-root read-only operation, restart, and rejection of insecure production settings. A disposable backup/restore exercise preserved four saved revisions, reconciled deletion, revoked restored access, and verified persistence after database restart. Its disposable restore databases and containers were removed.

The existing Vite/esbuild and Wrangler/Workers-types peer-version warnings remain. Both pinned pairs predate these changes; compilation and the actual Worker/browser/MCP checks passed. This report records observed compatibility, not support for every possible dependency API.

The source-release publisher has local validation and code review; its first live GitHub publication remains a separate delivery gate. These checks do not establish a new PostgreSQL public deployment, real SMTP delivery, customer load capacity, production disaster recovery or customer pilot results.
