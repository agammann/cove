# Getting started with Cove

[Documentation](README.md) · [Open Cove](https://cove-context.alx21.chatgpt.site)

Use Cove to leave a clear record of your work and pick it up in another conversation. These steps use the public Sites edition. For a local installation, start with [local development](development.md).

## Create your first project

1. Open Cove and sign in with ChatGPT. This signs you into your private workspace; it does not connect an assistant or import your conversations.
2. Choose **New project**, enter a project name and description, and choose **Create project**.
3. Fill in **Goal**, **Current state**, and **Next steps**. Add decisions, constraints, notes, or source references as useful.
4. Choose **Save context**. Wait for the saved project view before leaving the page.

For example, a research project might have the goal “Write a short brief for new customers,” the current state “Sources collected and outline drafted,” and the next step “Review the outline before writing.” Start with enough detail for someone else to continue.

Unsaved changes live in the open editor. Closing or reloading the tab can lose them. If another session saves first, Cove reports a conflict and retains your open draft. Review the newer context before retrying.

## Continue in another assistant

1. Open your saved project and choose **Create handoff**. A handoff captures the saved revision; save any edits first.
2. Choose **Copy concise handoff**, or switch to **Full handoff** and copy that version when the assistant needs more detail.
3. Paste the handoff into your next assistant conversation. Explain what you want to do next.
4. When the work changes, return to Cove, update the context, and save it. Create another handoff when you are ready to switch again.

An existing handoff keeps its original snapshot. If Cove reports newer changes, review them before continuing. Copying a handoff does not automatically update Cove, and Cove cannot revoke text already copied into another service.

## Optional assistant connection

Manual copying requires no integration. For a compatible host with remote MCP and OAuth support, enter this server address in its connection setup:

```text
https://cove-context.alx21.chatgpt.site/api/mcp
```

Complete the sign in and consent flow. In Cove, select only the projects and permissions the assistant needs. Use the save and continue prompts from the connection and handoff screens. Check the actual saved revision or handoff in Cove after an assistant reports success.

Official SDK clients have been tested; live ChatGPT and Codex assistant host interactions remain unverified. Available setup controls differ by host and account. Consult the [MCP reference and compatibility matrix](mcp.md) before relying on an integration. Opening the MCP address as a browser page can return HTTP 405; it is a protocol endpoint, not the workspace.

Use **Assistant connections** to review or revoke grants. Revocation blocks later requests, but does not remove copied text. A revoked connection currently requires a fresh OAuth client registration; see the reference for this limitation.

Editing permissions keeps the connection's current expiration unless you explicitly select a new duration. A new duration starts when you save; keeping an already expired date does not reactivate access.

## Export, import, and organize

| Task | Where to do it | Result |
| --- | --- | --- |
| Keep a portable copy | Project settings → **Download JSON** | Context, revisions, and handoffs in Cove's importable format |
| Read a project outside Cove | Project settings → **Download Markdown** | A readable copy of saved revisions and handoffs |
| Bring a project into your account | Account → **Import a project** | A new private project with new IDs; existing projects stay separate |
| Hide a finished project | Project settings → **Archive** | Data and existing assistant grants remain |
| Remove a project | Project settings → **Delete project permanently** | Requires its current name as confirmation |

Imports and exports exclude passwords, sessions, OAuth tokens, and assistant permissions. The browser limit is 8 MiB. To move a local project to the website, export JSON locally and import it into your hosted account. See [export and import](portability.md) for details.

## If something is confusing

| What you see | What to check |
| --- | --- |
| A different or empty workspace | Hosted ChatGPT accounts and local email/password accounts are separate. Confirm which installation and account you opened. |
| An old handoff | It is a saved snapshot. Review newer changes or create a handoff from the latest saved revision. |
| A save conflict | Keep the editor open, review the latest revision, and reconcile the draft before retrying. |
| An assistant cannot find a project | Confirm that its Cove connection is active and grants that project with the required permissions. |
| A source link has no extracted content | Cove stores references; it does not automatically fetch their contents. Save the relevant notes yourself. |

Read [privacy, retention, and limits](privacy.md) before storing sensitive material. For a reproducible problem, [open a GitHub issue](https://github.com/agammann/cove/issues) with the edition, steps, and error text. Remove private project content and credentials from reports.
