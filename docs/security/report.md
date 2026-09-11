# Security Review: cove

## Scope

Standard source audit of Cove before remediation and first public source upload

- Scan mode: repository
- Target kind: directory_snapshot
- Target ID: target_sha256_20260bd33b0404fcf32b67508f1f68d7b474aae522d934328897bb34ddf05f64
- Snapshot digest: codex-security-snapshot/v1:sha256:3f19c26a56b58dbd97d165f446c59317b968933affd31e2eb8161367bb26b33e
- Inventory strategy: directory
- Included paths: .
- Excluded paths: none
- Runtime or test status: Local application tests separate from audit; no deployed service

Limitations and exclusions:
- Generated metadata and dependency tree not exhaustively audited.
- Architecture worker final response unavailable; interim facts independently reconciled by parent.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 2 |
| Severity mix | high: 1, medium: 1 |
| Confidence mix | high: 2 |
| Coverage | partial |
| Validation mode | static |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Cove is a standalone context store for individuals. React browser routes and seven HTTP MCP tools call shared transactional PostgreSQL domain services. Better Auth manages verified email/password sessions, OAuth/PKCE and JWT validation. Local startup binds loopback; documented production uses a private Node API behind Caddy HTTPS (apps/api/main.ts:5-11; apps/api/server.ts:19-21; packages/mcp/server.ts:12-38; compose.production.yaml).

### Assets

- Private project documents, immutable revisions, handoffs and source references (packages/database/schema.ts; packages/domain/service.ts).
- Human session identities, password recovery links, OAuth credentials, grants and revocation state (apps/api/auth.ts; packages/mcp/server.ts).
- Server configuration secrets consumed by database and SMTP and Better Auth, including the credentials exposed by the usage finding (apps/api/config.ts:10-17; apps/api/server.ts:19-21; packages/domain/service.ts:1078).
- Persistent database and independently preserved deletion/revocation ledger (compose.production.yaml; scripts/reconcile-recovery.mjs).

### Trust Boundaries

- Browser to Fastify: exact Host and Origin validation plus verified live session; browser mutations require the canonical Origin (apps/api/server.ts:67-74,217-239).
- OAuth client to resource: provider validates signature, issuer, audience, expiry and cove scope; Cove requires subject/client claims and maps to live owner/client binding, then checks project capabilities on each operation (packages/mcp/server.ts:14-38; packages/domain/service.ts:209-255,721-745).
- Ordinary account to operator configuration: usage metadata must expose quotas only; full Config is currently stored under the type-only Pick and returned, violating this boundary (apps/api/server.ts:21,376; packages/domain/service.ts:172-176,1078).
- API to SMTP: configured host/port, credentials and verification/reset URL leave the service through Nodemailer. secure=false currently permits opportunistic TLS, violating mandatory transport protection under an active network attacker (apps/api/auth.ts:10-23).
- Database writes: owner/project locks, parameterized SQL, version checks and idempotency reauthorization protect cross-account ownership and integrity; immutable triggers enforce historical update prohibition (packages/domain/service.ts:191-255; packages/database/migrations/0001_integrity.sql).
- Imported JSON and saved text remain data: strict bounded schema, graph checks, new IDs, imported attribution and no grants; React renders text, reference anchors restrict schemes, source pointers are never fetched (packages/shared/context.ts; packages/domain/service.ts:909-1014; apps/web/src/Project.tsx).
- OAuth CIMD network metadata is a separate dependency-owned HTTPS fetch boundary. Targeted review found public DNS validation, address pinning and redirects disabled through fetchClientMetadataResource (apps/api/auth.ts:5,78; installed @better-auth/cimd/dist/node.mjs).
- Privileged operator recovery consumes a local ledger path and DATABASE_URL, deletes acknowledged records and revokes all restored sessions/grants. Actual ingress isolation and ledger currency are operator responsibilities (scripts/reconcile-recovery.mjs:1-54).

### Attacker Capabilities

- Anonymous clients can send bounded HTTP requests and register OAuth public clients; self-registered verified accounts can own projects and request usage metadata.
- Authorized assistants can read/write/create handoffs only within stored capabilities; they cannot expand grants or operate account lifecycle APIs.
- Saved/imported content can contain malicious text or reference locations but conveys no execution or authorization power.
- An active network adversary may alter plaintext SMTP negotiation in the supported STARTTLS configuration.
- No attacker control of operator environment, deployment host, independent ledger or privileged scripts is assumed.

### Security Objectives

- Keep every project/historical/direct/search operation within authenticated ownership and current connection grants.
- Preserve historical snapshots and reject stale saves without overwrite; reauthorize idempotent responses.
- Keep server credentials out of browser responses, logs, analytics and exports.
- Require encrypted SMTP in production before credentials or account links are transmitted.
- Never silently reactivate restored deleted accounts or revoked access; keep ingress blocked until the current deletion ledger is established.
- Bound request/document/import/page/response sizes and preserve submitted data on limit errors.

### Assumptions

- The supplied source has not been publicly deployed. Source review and local tests do not verify a live assistant host or production environment.
- Independent architecture review confirmed database location is not derived from Compose's db service: DATABASE_URL in .env.production independently selects the actual recipient. docs/operations.md requires operator agreement with Compose password and service; code does not enforce it.
- Local .env is loaded by apps/api/main.ts if present; Docker excludes .env and .env.\*. Production config enters via env_file .env.production; runtime is USER node, read-only API with tmpfs /tmp, no added capabilities (Dockerfile; .dockerignore; compose.production.yaml).
- Production publishes proxy ports80/443 only; database volume is database:/var/lib/postgresql/data and API trusts proxy headers because no API host port is published. External exposure of that API would violate the documented topology.
- BETTER_AUTH_SECRET reaches Better Auth, DATABASE_URL reaches pg, SMTP credentials reach the configured SMTP server. Literal secrets were not read for this audit.
- Backup script writes gitignored backups/verification.dump; production encrypted off-host storage and ledger replication are explicitly external operational requirements. Ledger is only append-only by application convention, not a database tamper-proof record.
- A revoked owner/client binding requires a fresh client registration; fixed-client reconnection remains a documented product limitation.
- Independent baseline plus focused review completed. Architecture worker's interim resource observations were reconciled against parent-read consumers; the full worker result was unavailable at final assembly. Dependency internals were examined only to explain configured controls, not exhaustively audited.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Usage summary exposes server credentials to account owners](#finding-1) | high | high | inline below |
| [Production SMTP can send credentials and recovery links without TLS](#finding-2) | medium | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Usage summary exposes server credentials to account owners

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | The complete configuration is passed unchanged, stored by a TypeScript parameter property, and serialized without a runtime allowlist. |
| Category | information-disclosure |
| CWE | CWE-200 |
| Affected lines | packages/domain/service.ts:1078, apps/api/server.ts:21, apps/api/server.ts:376, packages/domain/service.ts:172-176 |

#### Summary

Any verified account can request the usage summary and receive the full runtime configuration, including the authentication secret, database URL, and configured SMTP credentials.

#### Root Cause

The server passes its entire configuration to CoveService. A TypeScript Pick is used only as a static annotation, so the parameter property retains every runtime key. usage returns that same object to an ordinary verified account, crossing the server-secret boundary.

**Verified-account usage route** — `apps/api/server.ts:376`

A verified account is sufficient to invoke usage; there is no operator-only boundary.

```
  app.get("/api/usage", async (req) => service.usage(await actor(req)));
```

**Complete runtime configuration enters domain service** — `apps/api/server.ts:21`

The caller supplies the complete parsed server configuration, which includes credential fields.

```
  const service = new CoveService(pool, c);
```

**Type-only narrowing preserves extra runtime keys** — `packages/domain/service.ts:172-176`

TypeScript Pick constrains the declared type but the parameter property retains the original object at runtime.

```
    public limits: Pick<
      Config,
      "MAX_PROJECTS" | "MAX_REVISIONS" | "MAX_STORAGE_BYTES"
    >,
  ) {}
```

**Unfiltered object returned in account response** — `packages/domain/service.ts:1078`

Fastify serializes the original configuration as the limits field; no response schema removes credential keys.

```
        limits: this.limits,
```

#### Validation

The parent independently read configuration construction, constructor storage, verified-account route and JSON sink. These establish credential disclosure without reading or reproducing credential values.

Validation method: independent focused source investigation and parent static validation

Limitations:
- No production service is deployed; severity describes the supplied production code path.
- Downstream database or SMTP compromise was not exercised.

#### Dataflow

readConfig complete object -\> buildServer -\> CoveService public parameter property -\> usage limits -\> authenticated JSON response

- **Source:** Server configuration

- **Sink:** GET /api/usage JSON response

- **Outcome:** A normal account receives server credentials.

#### Reachability

Any verified human account can call the route. Email verification and ownership protect user data but do not authorize server secrets.

- **Attacker:** ordinary verified account

- **Entry point:** GET /api/usage

- **Outcome:** credential disclosure

#### Severity

**High** — High impact credential disclosure is directly reachable by self-registered verified accounts. Further misuse depends on credential scope and network reachability.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** Authentication and deployment secrets leave the server boundary.

Likelihood assessment:
- **Level:** high
- **Why:** The Account screen requests the endpoint during normal use.

#### Remediation

Construct an explicit runtime allowlist of the three public numeric limits and return only those values. Add a regression test with sentinel extra configuration fields; rotate any credentials if the vulnerable endpoint was exposed to untrusted users.

Tests:
- Assert service limits and the GET /api/usage limits object contain exactly MAX_PROJECTS, MAX_REVISIONS, MAX_STORAGE_BYTES even when constructor input has sentinel credential fields.

<a id="finding-2"></a>

### [2] Production SMTP can send credentials and recovery links without TLS

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Application transport omits requireTLS; the installed Nodemailer implementation only upgrades when advertised or required. |
| Category | cleartext-transmission |
| CWE | CWE-319 |
| Affected lines | apps/api/auth.ts:10-16, apps/api/config.ts:14 |

#### Summary

The supported SMTP_SECURE=false production configuration permits opportunistic STARTTLS. A network attacker who suppresses STARTTLS advertisement can receive SMTP authentication and verification or recovery messages over plaintext.

#### Root Cause

Production accepts SMTP_SECURE=false, intended for STARTTLS. makeAuth passes secure:false and credentials to Nodemailer without requireTLS. Installed Nodemailer upgrades only when STARTTLS is advertised or requireTLS is set, so omission of that capability allows plaintext authentication and messages.

**SMTP transport permits optional TLS** — `apps/api/auth.ts:10-16`

When secure=false, no requireTLS option forces successful STARTTLS before authentication or message delivery.

```
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE === "true",
    ...(c.SMTP_USER
      ? { auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } }
      : {}),
  });
```

**Authentication email contains sensitive links** — `apps/api/auth.ts:17-23`

The same transport sends account verification and password recovery URLs.

```
  const send = async (to: string, subject: string, url: string) => {
    await mail.sendMail({
      from: c.SMTP_FROM,
      to,
      subject,
      text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.`,
    });
```

#### Validation

Parent read transport options, production validation and Nodemailer smtp-connection STARTTLS condition at installed dist/esm/smtp-connection/index.js:1227-1230. No mail interception or real credential testing occurred.

Validation method: Independent baseline source investigation and parent source validation

Limitations:
- Requires a production STARTTLS deployment and active network position; implicit TLS configuration is unaffected.

#### Dataflow

Production SMTP configuration -\> Nodemailer optional STARTTLS -\> SMTP credentials and account links

- **Source:** Server-held SMTP credential and recovery message

- **Sink:** Unencrypted SMTP network

- **Outcome:** Credential or password-reset link interception

#### Reachability

Conditional on SMTP_SECURE=false and an active network attacker; no unprivileged application user alone can trigger interception.

- **Attacker:** network-path attacker

- **Entry point:** SMTP EHLO negotiation

- **Outcome:** plaintext sensitive message delivery

#### Severity

**Medium** — High-impact credential or account recovery exposure requires an active attacker on the API-to-SMTP network path and the supported STARTTLS configuration.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** Recovery links can authorize account access.

Likelihood assessment:
- **Level:** medium
- **Why:** Requires active network interference with a supported deployment option.

#### Remediation

Require successful TLS in production: implicit TLS with secure=true or requireTLS=true when secure=false. Keep local Mailpit plaintext limited to development. Add a transport test proving a non-STARTTLS server never receives AUTH or message data in production.

Tests:
- Assert production transport requires STARTTLS when implicit TLS is disabled.
- Use a local controlled SMTP fixture without STARTTLS and assert rejection before authentication.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Server configuration to usage response | not recorded | Reported | Runtime Pick fails to filter secrets at packages/domain/service.ts:1078; parent source validated. |
| Production email TLS | not recorded | Reported | Missing mandatory STARTTLS at apps/api/auth.ts:10-16 under supported secure=false configuration. |
| OAuth authorization and live grants | not recorded | No issue found | Focused review established signed consent, S256 PKCE, redirect/client/code binding, audience/scope checks, live grants and hardened public-only CIMD fetch. No separate bypass identified. |
| Tenant isolation, history, conflicts, imports and deletion | not recorded | No issue found | Owner filters and live grants in packages/domain/service.ts apply to historical/direct/search paths; parameterized queries; owner locks serialize quota-bearing writes. Import validates graph and remaps attribution/IDs; DB constraints and immutable triggers enforce project relationships. |
| Browser rendering and origin boundary | not recorded | No issue found | React text rendering, HTTP/HTTPS-only anchors, CSP and exact Host/Origin guards. No raw HTML execution sink. |
| Operational recovery boundary | not recorded | Needs follow-up | scripts/reconcile-recovery.mjs revokes all restored sessions/grants and applies deletions. Actual independent ledger currency, isolated ingress and deployed backup encryption remain operator prerequisites. |
