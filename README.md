# Cove

**Your work, wherever your agents go.**

Cove keeps your project's goals, decisions, sources, progress, and next steps in one private workspace. Save your context, create a handoff, and continue with another assistant without rebuilding the story from scratch.

**[Open Cove](https://cove-context.alx21.chatgpt.site)** · **[Getting started](docs/getting-started.md)** · **[Documentation](docs/README.md)**

[Cove v1](docs/v1.md) defines the supported website, installed Codex plugin, and PostgreSQL source-installation paths. [Versioned releases](https://github.com/agammann/cove/releases) include source and SHA256 checksums.

## Start with the website

1. Open Cove and sign in with ChatGPT.
2. Choose **New project** and give your project a name.
3. Record your goal, current state, and next steps, then choose **Save context**.
4. Choose **Create handoff** and copy the concise or full version into your next assistant conversation.

The public website runs the complete app on OpenAI Sites with persistent storage. Your projects require sign in and remain private to your account and the assistant connections you authorize. You do not need to install software or supply a model API key.

![Cove workspace with a saved research project and synthetic example content](docs/design/workspace-desktop.png)

## Connect the Cove plugin

1. Install or connect **Cove** in your assistant, then sign in to the Cove website.
2. Open **Assistant connections → Cove plugin → Choose Cove plugin projects**.
3. Select the projects, permissions, and access duration you want to share. To save context and create handoffs, choose **Read, update, and create handoffs**.
4. Choose **Authorize selected projects**, then ask your assistant to save or continue a project using the [example prompts](docs/mcp.md#save-prompt).

Connecting the plugin alone grants no project access. After sign in, Cove may return to **Projects**; open **Assistant connections** from the sidebar to finish authorization.

## What you can do

* Keep structured context with revision history and comparisons.
* Create handoffs pinned to a saved revision, with a warning when newer context exists.
* Copy a handoff manually or grant an assistant access to selected projects through MCP.
* Export projects as JSON or Markdown and import a Cove JSON export into a new project.
* Review activity, revoke assistant access, archive projects, or delete your data.

Cove stores what you submit. It does not automatically read your assistant conversations or fetch the contents of source links. Copied text remains outside Cove's control.

## Choose your path

| I want to… | Start here |
| --- | --- |
| Use the public app and create my first handoff | [Getting started](docs/getting-started.md) |
| Connect an assistant | [MCP tools, prompts, and compatibility](docs/mcp.md) |
| Run or develop Cove on my computer | [Local development and testing](docs/development.md) |
| Maintain the hosted Sites edition | [Sites architecture and operations](docs/sites.md) |
| Operate my own PostgreSQL installation | [PostgreSQL operations](docs/operations.md) |
| Understand privacy or move my data | [Privacy](docs/privacy.md) and [export/import](docs/portability.md) |

The installed Cove plugin uses the managed `/mcp` route. Custom OAuth clients use `https://cove-context.alx21.chatgpt.site/api/mcp`. The [October 4 live plugin test](docs/verification-assistant-2026-10-04.md) passed a real assistant save, exact readback, pinned handoff, and continuation by a fresh assistant in Codex. The earlier native Codex 0.159.2 OAuth host check passed all seven tools. See the [compatibility matrix](docs/mcp.md#host-compatibility-matrix) for the tested clients and scope.

## For developers

The repository contains two distributions sharing the React frontend. The hosted edition uses a Worker, D1, and ChatGPT sign in. The original local distribution uses Fastify, PostgreSQL, and email/password accounts. Their accounts and data are separate.

Local prerequisites are Node.js 24, pnpm 11.19.0, Git, and Docker with Compose. Follow the [setup guide](docs/development.md) for complete commands, email verification, testing, and troubleshooting. **`pnpm build` builds Sites; `pnpm build:local` builds the local server.**

| Path | Responsibility |
| --- | --- |
| `apps/web` | Shared React frontend |
| `apps/sites` | Hosted Worker, D1 operations, authentication, OAuth, and MCP |
| `apps/api` | Local Fastify API and email authentication |
| `packages/database` and `packages/domain` | PostgreSQL schema, migrations, and transactional operations |
| `packages/mcp` and `packages/shared` | MCP tools, validation, comparisons, and handoff formatting |
| `tests` and `scripts` | Automated checks, setup, builds, and recovery tools |

See [GitHub Actions](https://github.com/agammann/cove/actions/workflows/ci.yml) for current automated results, [October 2 verification](docs/verification-2026-10-02.md) for the compiled browser and HTTP MCP checks, and the [documentation index](docs/README.md) for dated records and known limits.

## License

Cove is licensed under the [MIT License](LICENSE). Third party dependencies retain their own licenses.
