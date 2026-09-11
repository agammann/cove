# Operating Cove

## Supported initial topology

One small Linux host with Docker Compose, one Node 24 API container, one PostgreSQL 17 database, and Caddy terminating HTTPS. Budget at least 2 vCPU, 4 GiB RAM and 20 GiB persistent disk for an early-access installation with modest concurrency. These are starting assumptions, not load-test results. Use an external authenticated SMTP service and encrypted off-host backups. Do not expose PostgreSQL to the public network.

`compose.yaml` is local-only. `compose.production.yaml` is a separate configuration, not an overlay; never combine them accidentally. No service purchase, domain change, public tunnel, or deployment is included in repository publication.

## Production preparation and deployment

1. Obtain explicit operator approval for the target host, domain, public service exposure, and any billable resources.
2. Create `.env.production` from `.env.example` outside Git. Set `NODE_ENV=production`, `PORT=4317`, `APP_URL=https://approved-domain`, a random `BETTER_AUTH_SECRET`, `DATABASE_URL=postgresql://cove:URL_ENCODED_PASSWORD@db:5432/cove`, and authenticated SMTP settings. Use `SMTP_SECURE=true` for implicit TLS port 465, or port 587 for STARTTLS. Keep credentials out of shell history and logs.
3. Supply Compose interpolation values `POSTGRES_PASSWORD` and `COVE_DOMAIN` securely in the process environment or an untracked Compose env file. They must agree with the application environment. Install DNS only for the approved host.
4. Build and migrate before opening ingress:

```sh
docker compose -f compose.production.yaml build api
docker compose -f compose.production.yaml up -d db
docker compose -f compose.production.yaml run --rm api node dist/packages/database/migrate.js
docker compose -f compose.production.yaml up -d api proxy
```

5. Verify live/readiness, email delivery, sign-up/recovery, OAuth discovery and PKCE, project isolation, a save/handoff/copy flow, two independent connections, revocation, and a restart on this deployment. Record the exact image/commit and date. A successful container build alone is not deployment verification.

The API runs non-root with a read-only container filesystem, no added Linux capabilities, and a private database network. Trusting proxy headers is allowed only because the API has no published host port and receives public traffic through Caddy. Do not expose its container port while `TRUST_PROXY=true`.

## Health and observability

`GET /health/live` confirms the process can respond; `GET /health/ready` checks the application database table and returns 503 on failure. The Host header must match `APP_URL`, including for internal health probes. HTTPS-only secure cookies will not work through a plain external HTTP preview.

Application JSON logs provide a request ID, route template, method, status, and latency. An operator can ingest them into existing logging/metrics tools and alert on elevated 5xx count, sustained latency, readiness failure, disk usage, database connections, backup age, and SMTP errors. No error-monitoring vendor is silently connected. Keep content, cookies, authorization headers, query strings, reset URLs, and complete request payloads out of logs. Set log retention (recommended seven days) at the host. Signals SIGTERM/SIGINT close the API and PostgreSQL pool gracefully.

## Migrations and rollback

Reviewed Drizzle SQL files are ordered in `packages/database/migrations/meta/_journal.json`. Apply `pnpm db:migrate` locally or the compiled migration command in production. Migrations are additive where practical and tracked in the database. Never use `drizzle push`, schema resets, `compose down -v`, or truncate customer tables to make an upgrade pass.

Before each upgrade, record the running image digest/commit and schema migration position; create and verify a backup. Bring up one new API version only after migration succeeds. Roll back the application to the prior image only if its schema assumptions remain compatible. Do not automatically reverse data migrations. If the database itself must be restored, follow isolated recovery below and account for the recovery point/data loss explicitly.

## Backups

Choose daily PostgreSQL custom-format backups and a seven-day retention period for the initial topology. Store them encrypted off-host with restricted operator access. Verify checksums and perform a disposable restore at least weekly. PostgreSQL volumes are persistence, not backups.

Use `pg_dump -Fc --no-owner` with a restricted backup credential. In Compose, pipe binary output directly to a file with a binary-safe program; avoid Windows PowerShell text redirection for custom-format dumps. `scripts/backup-verify.mjs` demonstrates Node binary stream handling and runs a disposable restore test. The verification script leaves a gitignored local dump; production backups require an independently configured encrypted destination and retention job.

The security ledger is an append-only operational record of deletions and revocations. Export its rows as JSON to an independent durable location at least as frequently as accepted deletion operations must survive disaster recovery. A snapshot-local ledger cannot tell you about deletions that happened after that snapshot. For an actual release, wire a reliable export/replication procedure, alert on its failure, and establish the last durable checkpoint. If the latest deletion ledger is missing or cannot be proven current, **do not reopen restored customer data**.

Routine maintenance, run with bounded batches where data volume requires it:

```sql
DELETE FROM idempotency WHERE expires_at < now();
DELETE FROM verification WHERE "expiresAt" < now();
DELETE FROM "session" WHERE "expiresAt" < now();
DELETE FROM "oauthClientAssertion" WHERE "expiresAt" < now();
```

Do not remove unexpired auth records or security-ledger entries by guesswork. Keep the ledger for at least the oldest retained backup plus operational margin. Backups are not rewritten on every account deletion; disclose their actual retention to users.

## Isolated recovery

1. Block all public ingress. Restore the backup into a **new, isolated database** using `pg_restore --exit-on-error --no-owner`; do not restore over a live database.
2. Validate the migration position, table counts, sample project revisions, handoff relationships, and backup checksum.
3. Obtain the latest independently preserved security ledger, including every acknowledged deletion/revocation since the backup. Apply it with:

```sh
# Set DATABASE_URL securely to the isolated restored database.
node scripts/reconcile-recovery.mjs --confirm-isolated-recovery /secure/latest-ledger.json
```

4. This procedure deletes ledger-listed accounts/projects, revokes all restored connections and grants, and removes restored sessions, OAuth access/refresh tokens, consents, and temporary verification records. Rotate `BETTER_AUTH_SECRET` and persisted JWKS signing keys as a separate approved credential operation before reopening. All clients must sign in and authorize again; old JWTs also fail connection checks.
5. Re-run isolation, permissions, and deletion checks. Confirm the most recent deletion ledger was applied. Only then switch the API to the restored database and reopen ingress. Publish the actual recovery point and any data loss to affected users according to the operator's policy.

`node scripts/backup-verify.mjs` verifies a custom dump restore, deletion reconciliation, connection/session revocation, pool reconnection and an actual restart of the local Cove database container. See `docs/recovery-verification.json` after a successful run. It never restarts unrelated Compose services.
