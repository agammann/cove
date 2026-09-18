# Architecture and data model

This guide describes the original Fastify/PostgreSQL distribution. The public website uses the [Sites architecture](sites.md). See [local development](development.md) for build and setup commands, or the [documentation index](README.md) to choose a guide.

Cove runs one React frontend, one Fastify service that also serves MCP, and one PostgreSQL database. Production uses a Caddy HTTPS proxy. Mail is an operator-configured SMTP service; Mailpit is a development-only fixture. No model inference happens inside Cove.

Browser endpoints and MCP tools call `CoveService`. The service derives the account and assistant identity from verified authentication; submitted display labels never establish identity. Every operation checks current account existence and project ownership. Assistant operations additionally check the independently stored connection's status, expiry, and project capability.

## Records

Better Auth owns the user, session, password identity, verification, JWKS, OAuth client/resource/consent/access/refresh-token tables. Its generated SQL is checked into the initial Drizzle migration. Application records:

| Record | Invariants |
| --- | --- |
| `cove_owners` | One application owner per verified authentication user; cascades on user deletion |
| `projects` | One owner; monotonic current version; archived flag; accounted document bytes |
| `revisions` | Unique project/version; full bounded structured document; authenticated actor ID and label; UTC timestamp and summary |
| `handoffs` | Snapshot tied by composite foreign key to a revision in the same project; replacement references the same project |
| `connections` | Server UUID, owner/client binding, human label, status, expiry, last verified interaction |
| `grants` | One connection/project pair; capabilities validated by both service and database ownership trigger |
| `events` | Actor and operation metadata with relevant version and record ID; no duplicate context body |
| `idempotency` | Actor/project/operation/key scope, SHA-256 canonical-payload fingerprint, original result, seven-day expiry |
| `measurements` | Owner/project/connection IDs and bounded event kind only |
| `security_ledger` | Deleted record IDs and revocation IDs, separate from cascading application records |

PostgreSQL timestamps include timezone and are stored as UTC. The browser renders dates in the viewer's locale. UUIDs identify application records; auth IDs remain library-managed. JSON object keys are canonicalized for idempotency fingerprints without changing array order.

## Atomicity

A context save locks the owner quota row and project, checks current grants, checks the idempotency record, verifies `expectedVersion`, validates capacity, inserts a revision, advances the project, and records activity and measurement within one transaction. A stale request receives `VERSION_CONFLICT`, the current version, and an authenticated comparison path. The browser retains the draft in component memory until the user resolves the conflict or explicitly leaves.

Handoff publication uses the same transaction boundary and project lock. It only publishes from the caller's identified current revision. Retrieval returns the original snapshot and a separate comparison with current context. Database triggers reject updates to revisions and handoffs. Restoring history calls the same save service and creates a new revision.

The first release uses full document revisions rather than a patch/event-sourcing framework. This keeps validation and conflict semantics explicit. Source and artifact locations are data pointers; they are never opened automatically. Statement kinds distinguish preferences, decisions, agent assertions, and statements with sources. A source attachment is not verification.

Search uses PostgreSQL full-text matching over current revision content and project metadata. Historical revisions are retrieved through authenticated history, not automatically mixed into search results. Pagination uses stable secondary IDs; concurrent insertions can shift offset pages, so pages are not a consistent multi-request snapshot.
