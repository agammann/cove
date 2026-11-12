# Changelog

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
