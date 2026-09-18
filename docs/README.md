# Cove documentation

[Open Cove](https://cove-context.alx21.chatgpt.site) · [Repository overview](../README.md)

## Use Cove

| Guide | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Your first project, saving context, copying handoffs, and common questions |
| [MCP reference](mcp.md) | Assistant connection addresses, permissions, tools, prompts, and verified compatibility |
| [Export and import](portability.md) | Portable formats, moving between installations, and size limits |
| [Privacy](privacy.md) | Stored data, drafts, retention, deletion, and limits |

## Develop and operate

| Guide | Applies to |
| --- | --- |
| [Local development](development.md) | Setup, build commands, testing, and troubleshooting for both distributions |
| [Sites](sites.md) | The public app: Worker, D1, ChatGPT sign in, deployment configuration, and hosted verification |
| [PostgreSQL architecture](architecture.md) | The original Fastify service and PostgreSQL data model |
| [PostgreSQL authentication](authentication.md) | Email/password accounts, sessions, OAuth, and assistant permissions |
| [PostgreSQL operations](operations.md) | Independent deployment, SMTP, migrations, backup, and recovery |

The public app uses Sites. PostgreSQL accounts, email setup, backups, and deployment commands apply to a separate installation. Use the Sites guide for hosted behavior and the development guide to choose the correct build.

## Verification and project records

Current automated results are in [GitHub Actions](https://github.com/agammann/cove/actions/workflows/ci.yml). The records below describe their stated dates and scope; they are not live status dashboards.

| Record | Scope |
| --- | --- |
| [Sites verification](sites.md#verification-on-september-13-2026) | Hosted browser verification, local Worker tests, and remaining external host checks |
| [Original verification](verification.md) | September 10 local PostgreSQL release checks |
| [Original release readiness](release-readiness.md) | PostgreSQL release snapshot and deployment prerequisites |
| [Security findings and fixes](security/README.md) | Original scan snapshot and subsequent remediation evidence |
| [Build checklist](build-checklist.md) and [decisions](decisions.md) | Implementation records |
| [Design research](design-research.md) | Visual references and redesign direction |
| [Pilot plan](pilot.md) | Proposed evaluation, not completed customer research |

Live external ChatGPT/Codex assistant interactions and production disaster recovery remain unverified. Successful SDK fixtures, manual browser use, and local recovery exercises each establish only their own tested paths.
