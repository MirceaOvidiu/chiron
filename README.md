# agy-toolkit

A reusable, project-agnostic toolkit for [Antigravity](https://antigravity.google): a consistent set of **skills** and **rules**, optional local-only **project memory**, and one-command setup of the **GitHub** and **Perplexity** MCP servers.

No company-specific content, no credentials, no assumptions about language or stack. Zero dependencies (Node ≥ 20).

## Quick start

```powershell
# 1. Install skills + rules into a repository (add --memory for local project memory)
node c:\dev\toolkit\src\cli.mjs install C:\path\to\repo --memory

# 2. Register the MCP servers (user-level, no secrets written)
node c:\dev\toolkit\src\cli.mjs mcp install

# 3. Set PERPLEXITY_API_KEY as a user env var, restart Antigravity, then:
node c:\dev\toolkit\src\cli.mjs mcp doctor
```

Optionally `npm link` in this folder to get an `agk` command. Full details: [SETUP.md](SETUP.md).

## What gets installed

| Component | Location in target repo | Notes |
|---|---|---|
| Skills: `plan`, `implement`, `review`, `commit-prep`, `github`, `perplexity-research`, `project-memory` | `.agents/skills/<name>/SKILL.md` | Loaded on demand; ask for them by intent or name |
| Rules: **coding principles** (Karpathy-style), **Simplified Technical English**, security & review, clear code | `.agents/rules/*.md` | The first two are always on (short). The others use `model_decision` |
| Project memory templates (optional) | `.agents/memory/*.md` | **Local-only**: added to `.git/info/exclude` |
| Install manifest | `.agents/.toolkit-manifest.json` | Local-only; hashes drive safe upgrade/uninstall |
| MCP servers `agk-github`, `agk-perplexity` | `~/.gemini/config/mcp_config.json` | Names are prefixed because MCP names are global |

Existing `AGENTS.md` / `GEMINI.md` are never touched.

## Safety model

- A file is only overwritten or deleted if its hash still matches what the toolkit installed. Edited or pre-existing files are preserved and reported.
- `--dry-run` on every mutating command. MCP config edits write a `.bak` first and refuse to touch unparseable JSON.
- GitHub MCP defaults to the **read-only** endpoint; the `github` skill additionally demands confirmation before any write.
- Secrets live only in environment variables.

## Development

```powershell
npm test
```

Layout: `kit/` (what is installed), `memory-templates/`, `src/` (installer, MCP, CLI), `tests/`.
