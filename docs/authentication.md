# Authentication and permissions

## Humans

Better Auth 1.7.3 handles password hashing, verification links, recovery tokens, sessions, and cookie/CSRF behavior. Accounts require email verification. Passwords are at least 12 characters. A verified email link can establish a session; password recovery invalidates existing sessions. The account screen lists/revokes sessions and can sign out other sessions.

Sessions expire after seven days and refresh at most once per day. Cookie caching is disabled, so session revocation is checked in the database. Production cookies are HttpOnly, Secure, SameSite=Lax. Browser application mutations require the exact Origin in addition to the authentication library's protections. Production refuses HTTP origins, placeholder secrets, missing authenticated SMTP, and demo-auth settings.

Account deletion requires the current password and the exact `DELETE MY ACCOUNT` confirmation. Project deletion requires its current name. The service checks current user existence even after request authentication, so deleted users cannot recreate application records from a previously verified request.

## Assistants

The maintained `@better-auth/mcp` provider implements OAuth discovery, resource binding, authorization code flow with S256 PKCE, redirect validation, access tokens, and refresh. Cove accepts only user-delegated tokens with a verified subject and client ID, audience bound to the canonical `/mcp` resource and the `cove` scope. Token lifetime is 15 minutes. OAuth scopes never replace project authorization.

The authorization page lets the human select projects and permissions before the provider completes consent. Each account/client binding has a separate server-generated connection ID, expiration (7, 30, or 90 days), and grants. Connections show pending until an authenticated MCP interaction is observed. Subsequent calls check the binding and grants again; no SDK transport retains permission authority between requests.

| Capability | Allows |
| --- | --- |
| `read` | Context, revisions, comparisons, project search, and handoff retrieval |
| `write` | Full validated context replacement with expected version |
| `handoff` | Creation of a pinned immutable handoff |

The UI offers read-only, read plus handoff, or all three capabilities. Assistants cannot call owner-only connection management, import/export, archive, or deletion routes. Identity is not inferred from a label or model-provider claim. Two different OAuth bindings are not proof of different providers.

Revocation immediately denies subsequent resource requests, including from an existing SDK client. A revoked account/client binding cannot be reactivated by replaying consent; authorize a fresh OAuth client for a replacement connection. This deliberately prevents old unexpired tokens from regaining access, but means a host that insists on reusing one fixed client ID needs an additional reconnection mechanism before that host can be supported after revocation. This is recorded in release limitations.

The 2026-07-28 Client ID Metadata Document path uses the provider's hardened metadata transport with public-address checks and no redirects. Dynamic registration is explicitly enabled as a compatibility fallback for older hosts; native loopback callbacks must register `application_type: native`. Arbitrary source URLs are never fetched. OAuth metadata discovery is the sole protocol-related outbound fetch path.

References checked during implementation: [Better Auth MCP](https://better-auth.com/docs/plugins/mcp), [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider), [email/password](https://better-auth.com/docs/authentication/email-password), and [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
