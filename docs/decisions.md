# Decisions

- 2026-09-08: Empty workspace verified; source lives in outputs/cove. Preserve the supplied brief; implement independently.
- Use Node 24, React/Vite, Fastify, PostgreSQL, Drizzle, Zod and the official MCP SDK. One API serves the built web application and MCP on the same origin.
- Better Auth and its maintained MCP/OAuth provider own authentication, passwords, recovery, protocol cryptography, discovery, PKCE and tokens. Cove independently enforces its account, connection and project grants on every operation.
- Browser and MCP routes share one domain service. PostgreSQL row locks serialize context writes and handoff publication. No model calls, automatic source fetching, or execution tools.
- No demo authentication is required. Local tests create explicitly labeled real test accounts in a disposable database. Production must reject all demo settings.
- Sites' Workers/D1 starter is incompatible with the explicitly requested PostgreSQL/Fastify topology; retain the user's stack and prepare local containers without registering or publishing a Site.
- Design direction: navy sidebar, cool white canvas, restrained teal actions, open context sections and a next-action rail. All illustrative design content stays in tests.

September 10 verification decisions:

1. Runtime quota configuration is projected into an immutable allowlist so API responses cannot expose unrelated configuration or credentials.
2. Production SMTP requires implicit TLS or STARTTLS before authentication and delivery. Local Mailpit remains a development fixture.
3. Container health checks use the Node HTTP client to preserve the canonical Host header, including when the request connects through loopback.
4. Publish the reviewed source publicly as authorized. Public deployment, production credentials and real assistant host verification remain separate external steps.
