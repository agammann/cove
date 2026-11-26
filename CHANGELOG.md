# Changelog

## 2.0.0

- Deliver the existing guarded, fresh-only PostgreSQL 18 installation and generated-credential/selector safeguards accumulated since 1.0.2. This is an operational compatibility break: preserve PostgreSQL 17 installations and prepare a separately reviewed migration rather than initializing a replacement. API, handoff and JSON schema 1 remain compatible.
- Require the existing synthetic PostgreSQL 18 rehearsal as well as fresh-install guards before main publication. Preserve older source tags/assets.
- Enable the supported SDK 2.3.0 collection guard at 20,000 elements for all three shared MCP routes, above the complete current schema bound of 16,415. Real authenticated HTTP regression checks reject excess collections, preserve the 128 KiB body cap, save/read a legitimate 600-entry context and retain live revocation behavior. No token, ownership or grant policy changes.
- Patch Vite to 8.3.7 with Rolldown 1.2.19 for GHSA-p4f5-76q4-ffq7. The notice concerns explicitly network-exposed development servers; the default preview binds loopback. No production exploitation is claimed; the initial audit reported zero.
- Preserve exact Git source bytes in ZIPs even when the packaging host has core.autocrlf=true. Current HTTP verification reports derive exact client/server SDK pins instead of retaining a stale version label. Correct current setup/delivery metadata and dated Codex/ChatGPT compatibility guidance without removing historical verification limits.

## 1.0.2

- Update authentication, MCP, Fastify, Drizzle, validation, email and related dependencies, including upstream security fixes.
- Refresh the Node 24 container image and development tooling.
- Verify the extracted source package with a disposable PostgreSQL consumer and production server smoke test; run browser and recovery checks on the checkout.

## 1.0.1

- Create local `.env` files exclusively so a concurrent setup never overwrites another process's environment.
- Preserve existing files, directories and dangling links without reading the template or following the entry.
- Test competing writers and ordinary setup, and include the fix in the versioned source download.

## 1.0.0

Cove's first stable source release defines the website, installed Codex plugin, and PostgreSQL source-installation paths. It includes structured private project context, revision history, pinned handoffs, explicit assistant project grants, and JSON/Markdown portability.

The release adds a source ZIP with a SHA256 checksum, consistent package/container/MCP version metadata, and a bounded v1 support contract. It updates the MCP client to 2.2.0 and the transitive Sharp dependency to 0.35.5 for the upstream published fixes.

See [v1 delivery and limitations](docs/v1.md) and [October 6 verification](docs/verification-2026-10-06.md) before choosing an installation path.
