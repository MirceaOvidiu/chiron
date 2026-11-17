# Setup

## Prerequisites

- Node.js ≥ 20 (for the installer and for `npx` to launch the Perplexity MCP server)
- Git (optional; used to keep local artifacts out of commits)
- A Perplexity API key (https://www.perplexity.ai/settings/api)
- For GitHub: an Antigravity build that can authenticate to the remote MCP server (OAuth in the browser on first use). If yours cannot, see *GitHub fallback* below.

## Install into a repository

```powershell
agk install [target] [--profile standard|minimal] [--memory] [--dry-run]
agk scan [target] [--dry-run]
```

- Default target is the current directory. Re-running is safe (idempotent).
- `--profile minimal` installs only the rules and the 4 core skills (`plan`, `implement`, `review`, `commit-prep`), without hooks or subagents.
- `--memory` also installs `.agents/memory/*.md` templates and ignores that folder locally.
- `agk scan` detects the stack, scripts, and top-level folders and updates bounded sections in `.agents/memory/`.
- Outside a git repo no ignore rules are written (reported in the output).

## Install as a global Antigravity plugin

```powershell
agk plugin install [--github-write] [--dry-run]
agk plugin build dist/agy-toolkit
```

`agk plugin install` builds the bundle directly into `~/.gemini/config/plugins/agy-toolkit` (`plugin.json`, `skills/`, `agents/`, `rules/AGENTS.md`, `hooks.json`, `scripts/`, `mcp_config.json`).

## Export rules for other AI tools

```powershell
agk export [target] --format agents-md|claude|copilot [--force] [--dry-run]
```

Generates `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` from `kit/.agents/rules/`. Refuses to overwrite an existing file without `--force`.

Commit `.agents/skills` and `.agents/rules` if you want your team to share them; the manifest and memory stay local.

## Upgrade

`git pull` this repo, then re-run `agk install <target>`. Unchanged files update, locally edited files are kept and listed, files removed from the toolkit are deleted only if unmodified. A repo that has toolkit files from before the manifest existed keeps any differing file.

`agk verify <target>` shows version, modified files, and missing files.

## Uninstall

```powershell
agk uninstall <target> [--dry-run]
agk mcp uninstall
```

Only unchanged toolkit files are removed. Modified files and memory content you wrote stay.

## MCP servers

```powershell
agk mcp install [--only github,perplexity] [--github-write] [--force] [--dry-run] [--config <file>]
agk mcp doctor
```

Default config file: `~/.gemini/config/mcp_config.json` (merged, never replaced; `.bak` written).

| Server | Transport | Auth |
|---|---|---|
| `agk-github` | Streamable HTTP `https://api.githubcopilot.com/mcp/readonly` | Browser OAuth on first use |
| `agk-perplexity` | stdio: `npx -y @perplexity-ai/mcp-server` (wrapped in `cmd /c` on Windows) | `PERPLEXITY_API_KEY` env var |

Set the key (Windows, persists for new processes), then **fully restart Antigravity**:

```powershell
setx PERPLEXITY_API_KEY "<your key>"
```

Verify in Antigravity under **Additional Options (...) > MCP Servers**. `agk mcp doctor` checks config entries and the env var but makes no network calls.

### Enabling GitHub writes

```powershell
agk mcp install --github-write --force --only github
```

The skill still requires explicit confirmation per write.

### GitHub fallback (if remote OAuth is unavailable)

Run the official local server over stdio instead, with a fine-grained PAT held in an env var `GITHUB_PERSONAL_ACCESS_TOKEN`:

```json
"agk-github": { "command": "docker", "args": ["run","-i","--rm","-e","GITHUB_PERSONAL_ACCESS_TOKEN","ghcr.io/github/github-mcp-server"] }
```

Edit it by hand in `mcp_config.json`; the toolkit will not overwrite it without `--force`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Perplexity tools missing / auth error | `agk mcp doctor`; set `PERPLEXITY_API_KEY` as a *user* env var; restart Antigravity completely |
| `npx` not found | Install Node.js and restart Antigravity so PATH refreshes |
| GitHub tools missing | Check MCP Servers panel; use the fallback above |
| `Cannot parse mcp_config.json` | Fix the JSON by hand; the file was not modified |
| Skills not appearing | Confirm `.agents/skills/<name>/SKILL.md` exists in the workspace (`agk verify`) |

## Limitations

- MCP tool names depend on the server version; skills therefore list tools instead of hardcoding names.
- Jira/Confluence and a local inventory/search index are not included yet (see CHANGELOG).
- Antigravity's `mcp_config.json` schema documents `url`/`command`/`args`/`env`; custom HTTP headers are not documented, so tokens are not passed via config.
