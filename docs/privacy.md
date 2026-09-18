# Implemented privacy, retention, and limits

The data handling principles below apply to Cove. Environment variable settings, Fastify request logging, PostgreSQL maintenance, and the recommended backup schedule describe the original PostgreSQL distribution. The public [Sites edition](sites.md) uses D1 and ChatGPT identity; the PostgreSQL backup schedule is not a promise about hosted retention. Production Sites backup and recovery guarantees have not been verified. See [getting started](getting-started.md) for account and project controls.

Cove stores only submitted structured context, references, immutable revisions, handoffs, account/session records, connection grants, and activity metadata. It does not automatically access private conversations, hidden reasoning, native assistant memory, local file contents, unrelated accounts, or source contents. There is no Cove-owned model service.

Data is private by account and project. Production HTTPS protects transport. Database and backup encryption at rest depend on the operator's host/storage configuration. Cove does not implement end-to-end encryption, zero knowledge, or a certification program. Operators with database access can read stored data.

Browser text uses React's escaped rendering. Markdown exports and handoffs are displayed as literal selectable text; raw HTML is never rendered. Reference links permit HTTP/HTTPS and descriptive paths, not executable URL schemes. Opening a link is an explicit user action; the target site's own privacy policies apply.

Unsaved drafts stay only in the current editor's memory. Cove warns before navigation; a conflict or expired session does not discard that memory. Closing or reloading the tab can lose unsaved work. There is no hidden local-disk draft cache. Successfully copied text goes to the system clipboard at the user's request and cannot be revoked by Cove.

Application request logs contain request IDs, route templates, operation method, status, and elapsed milliseconds. They omit context bodies, complete payloads, copied handoffs, request URLs with query tokens, and credentials. Authentication's own metadata includes email, session IP/user-agent and verification/recovery records. Do not enable verbose request-body logging at the reverse proxy or SMTP provider.

Product measurements contain event kinds and account/project/connection IDs, not context text. Copy measurement is a browser-reported successful clipboard action. Handoff retrieval, another connection's save, and setup failures are separate observations. None establishes successful continuation, provider identity, product-market fit, or willingness to pay. Owners can inspect/download their metadata in Account.

## Limits

| Limit | Default/configuration |
| --- | --- |
| Account projects | `MAX_PROJECTS=50` |
| Revisions per project | `MAX_REVISIONS=1000` (maximum configurable 5000) |
| Account saved document bytes | `MAX_STORAGE_BYTES=104857600` (100 MiB) |
| Context | 64 KiB; 4000 characters per text field; 100 entries per section |
| References | 100 sources + 100 artifacts; bounded labels, locations, descriptions |
| Handoffs | 1000 per project |
| Connections | 100 per account; expiration at most 90 days |
| Ordinary HTTP request | 128 KiB |
| Import/JSON export | 8 MiB |
| MCP response | 512 KiB |
| Pagination | 20 default, 50 maximum |
| IP request rate | `RATE_LIMIT=120` per minute plus stricter auth endpoint limits |

Quota rejection preserves existing data. Storage accounting counts immutable context and handoff document bytes, not PostgreSQL physical overhead; reserve extra disk capacity. If a project export exceeds the download limit, use the operator-assisted procedure in portability documentation. Limits are intentionally explicit rather than silently truncating saved material.

## Retention and deletion

Current and historical project data stays until project/account deletion. Archiving preserves data and grants. Deletion cascades through revisions, snapshots, search vectors, grants, activity, idempotency, and project measurements. Account deletion also removes authentication identities, sessions, OAuth tokens/consents, and connections. The minimal security ledger retains only stable IDs and deletion/revocation operations, with no context or email, to support recovery reconciliation.

Idempotency results expire logically after seven days; scheduled operator maintenance removes expired rows. Session and verification expiry is enforced even before cleanup. Activity and usage metadata currently stay for the life of their associated project/account. Set an explicit customer-facing backup policy before production; the supported deployment recommends daily encrypted backups retained for seven days and a security ledger retained independently for at least the longest backup lifetime. Backups are not physically rewritten on each deletion. Restores must apply the latest deletion ledger and revoke restored access before exposing the service.
