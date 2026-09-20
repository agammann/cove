# Live acceptance checks: September 19, 2026

Checked the public [Cove app](https://cove-context.alx21.chatgpt.site) through ordinary browser controls and real HTTPS requests. This was an operator acceptance exercise using fictional projects in the existing owner's account, not a study with recruited customers. UTC evidence timestamps fall on September 20.

## Fixes published

| Issue reproduced | Fix | Verification |
| --- | --- | --- |
| Editing a seven day assistant grant reset its duration selector to 30 days and could extend access unintentionally | Existing permissions now default to **Keep current expiration**. Both storage implementations preserve the timestamp when renewal is omitted. A new duration explicitly renews from the time of saving. | Live edit/save preserved the displayed expiration. Regression tests compare the exact stored timestamp, allow explicit renewal, and prove that editing an expired grant does not reactivate it. |
| A project list containing only archived records displayed a blank area | Empty states use the visible project list and explain how to include archived projects or browse another page. Searches have a separate no-results message. | Live archived-only state displayed its guidance; enabling archived projects revealed the retained samples; matching and empty searches both behaved correctly. |
| The browser requested a missing icon | Added and linked Cove's SVG favicon | The live page links the icon and its asset returns HTTP 200 with the SVG content type. |

The deployed application source is `914f0ba895398fbf19ca6bb10289ac0becded9e3`. Sites version 5 reached `succeeded` at `2026-09-20T00:45:44Z`. Documentation recorded after this deployment does not change its runtime.

## Public browser checks

1. Completed ordinary ChatGPT account selection and sign in into the private workspace.
2. Created a labeled fictional project and saved goals, current state, and next steps. Accented text and Japanese characters survived saving and a full page reload.
3. Created a handoff pinned to revision 2. Concise and full handoff copying were checked against the actual clipboard.
4. Opened two editors at revision 2. The first saved successfully; the second was rejected with a readable comparison and its draft intact. An explicit reconciled retry saved a new revision.
5. Reopened the original handoff and confirmed that its snapshot stayed at revision 2 while the screen identified newer context.
6. Triggered a JSON browser download. Downloaded file contents were not independently read back in this browser environment; export structure and round trips remain covered by automated tests.
7. Imported a separately generated, schema-validated JSON fixture through the file picker. The new project displayed the expected text and imported attribution.
8. At an actual 390 pixel viewport, edited and saved the imported project, created a handoff, and verified copied text. The page had no unintended horizontal overflow. Navigation strips intentionally scroll within their own bounds.
9. Verified the expiration fix after deployment, archived both sample projects, and checked the updated empty state and search behavior. Existing projects were preserved. Samples remain recoverable through **Include archived projects**.

## Live MCP and access checks

Two temporary official TypeScript SDK clients used the public HTTPS endpoint, dynamic registration, a loopback callback, S256 PKCE, and Cove's real browser consent screen. Credentials stayed in process memory and were not included in this report or source control.

The first client discovered seven tools and read the selected sample project's saved revision. Revocation was verified against that same connected client: its later request failed with `CONNECTION_REVOKED`.

The second client began with read-only access to the sample project. A valid update was denied with `PROJECT_UNAVAILABLE`. After granting write access to that project, the client saved revision 5 and created a pinned handoff. Repeating the same save request returned the original revision rather than creating a duplicate. Refresh-token exchange returned HTTP 200. The save, retry, and handoff checks also passed after deployment, producing revision 6. That connection was then revoked and a subsequent request was denied.

Anonymous requests to the project list, the known sample project's API, and the MCP endpoint returned HTTP 401. A request supplying forged Sites identity headers also returned HTTP 401. Public readiness returned HTTP 200. The returned production log sample contained no HTTP 5xx responses; this is a bounded observation, not continuous monitoring.

## Automated checks

Lint, TypeScript checking, all 21 tests across four files, and the Sites production build passed locally. The tests include real disposable PostgreSQL databases, local D1 fixtures, account isolation, concurrent writes, import/export, deletion, OAuth, revocation, and the new expiration regressions in both distributions. Consult [GitHub Actions](https://github.com/agammann/cove/actions/workflows/ci.yml) for the published change's complete browser, dependency, and packaging checks.

## Remaining verification boundaries

The live SDK journey establishes a real deployed protocol flow. It does not establish that an actual ChatGPT or Codex assistant host will register, reconnect, or choose the correct tools. Those host-specific checks remain pending. No independent second ChatGPT user was enrolled during this exercise; cross-account isolation was exercised in automated tests. No real customer research, load test, production account deletion, offsite backup restoration, or disaster recovery exercise is claimed.

See the [MCP compatibility matrix](mcp.md#host-compatibility-matrix), [privacy guide](privacy.md), and [Sites operations](sites.md) for the supported boundaries.
