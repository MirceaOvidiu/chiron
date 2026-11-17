# agy-toolkit

A reusable, project-agnostic toolkit for [Antigravity](https://antigravity.google). It provides skills, rules, lifecycle hooks, subagents, optional local project memory, and GitHub + Perplexity MCP setup.

This repository contains no company data, no secrets, and no stack assumptions. It has zero external dependencies and requires Node.js 20 or newer. Licensed under [MIT](LICENSE).

## Quick start

```powershell
# 1. Install the toolkit and memory templates into a repository
node c:\dev\toolkit\src\cli.mjs install C:\path\to\repo --memory

# 2. Scan the repository to populate architecture and commands
node c:\dev\toolkit\src\cli.mjs scan C:\path\to\repo

# 3. Register the MCP servers in Antigravity
node c:\dev\toolkit\src\cli.mjs mcp install

# 4. Set PERPLEXITY_API_KEY, restart Antigravity, then check status
node c:\dev\toolkit\src\cli.mjs mcp doctor
```

You can also install the toolkit as a single global Antigravity plugin:

```powershell
node c:\dev\toolkit\src\cli.mjs plugin install
```

Read [SETUP.md](SETUP.md) for all commands, profiles, and troubleshooting steps.

## What gets installed

| Component | Target path | Notes |
|---|---|---|
| Skills (`plan`, `implement`, `review`, `commit-prep`, `github`, `perplexity-research`, `project-memory`) | `.agents/skills/<name>/SKILL.md` | Loaded on demand |
| Rules (`coding-principles`, `simplified-technical-english`, `security-and-review`, `clear-writing`) | `.agents/rules/*.md` | First two are always on |
| Subagents (`agk-reviewer`, `agk-researcher`) | `.agents/agents/*.md` | Read-only fresh-context agents |
| Lifecycle hooks | `.agents/hooks.json`, `.agents/scripts/hooks.mjs` | Safety gate, session context, test verification |
| Project memory (`--memory`) | `.agents/memory/*.md` | Local only; added to `.git/info/exclude` |
| Install manifest | `.agents/.toolkit-manifest.json` | Local only; tracks file hashes |
| MCP servers (`agk-github`, `agk-perplexity`) | `~/.gemini/config/mcp_config.json` | Global config without secrets |

## Profiles and multi-tool export

* Use `--profile minimal` with `agk install` to install only the 4 core skills and the rules.
* Use `agk export --format agents-md|claude|copilot` to generate `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` from the rules.

## Safety model

* The installer overwrites or deletes a file only when its hash matches the manifest.
* Every mutating command supports `--dry-run`.
* The `PreToolUse` hook blocks secret tokens and dangerous commands.
* The `Stop` hook requests test execution when code changes without tests.
* GitHub MCP uses the read-only endpoint by default.

## Development

```powershell
npm test
npm run check:ste
```

Layout: `kit/` (target files), `memory-templates/`, `src/` (CLI, installer, scanner, plugin builder, exporter, STE checker), `tests/` (unit tests and evals).
