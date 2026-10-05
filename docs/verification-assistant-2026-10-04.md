# Live assistant verification — October 4, 2026

The installed Cove plugin passed a real save and continue workflow against the [public app](https://cove-context.alx21.chatgpt.site). The host was Codex using native plugin tools, with production Sites version 8.

## Authorization and fixture

The owner authorized only the disposable **Verification — October 2** project, with read, update, and handoff permissions for seven days. The assistant's project listing returned exactly that one project. Installation alone did not grant access: the earlier real tool call was denied until the owner saved the managed Cove plugin grant.

The fixture contains fictional onboarding content. Existing context and stable entry IDs were preserved; the test added one picnic checklist note and one next step.

## Executed workflow

1. Read the project's full current context at version 3.
2. Save the preserved context with the new fictional note and next step, using the current expected version and a fresh request key. The service returned saved version 4.
3. Read version 4 back and compare the complete context with the submitted document. The content matched exactly, and the revision ID matched the save result.
4. Create a handoff pinned to version 4.
5. Start a fresh assistant with only the project ID, handoff ID, and the question: “What colour is the blanket in the fictional picnic checklist?”
6. Retrieve the handoff through the native Cove plugin. The fresh assistant answered **blue** from the saved note. The answer and prior conversation were not supplied to it.

The retrieved snapshot and current context were both version 4, with no newer changes. The save and handoff IDs were captured in the private verification record. The test performed one context save and one handoff creation; continuation performed no project writes.

## Release checks

[PR #4](https://github.com/agammann/cove/pull/4) corrected managed MCP discovery for clients that omit routing headers. The adapter fills only missing headers; supplied headers, envelope validation, authenticated identity, and project grants remain enforced.

The merged code's [CI run](https://github.com/agammann/cove/actions/runs/37244011668) passed all 24 tests, lint, type checks, both builds, browser journeys, recovery checks, and container checks. The production version was deployed before this live assistant workflow.

## Scope

This verifies the installed Cove plugin's production save, exact readback, pinned handoff, and fresh-assistant continuation in Codex. A separate ChatGPT web UI client run was not performed. Earlier custom OAuth and browser checks remain documented in the [compatibility matrix](mcp.md#host-compatibility-matrix).
