# Changelog

## 0.3.0

- Add MIT `LICENSE`.
- Add lifecycle hooks (`kit/.agents/hooks.json`, `kit/.agents/scripts/hooks.mjs`) for `SessionStart`, `PreToolUse`, `PostToolUse`, and `Stop`.
- Add read-only subagent definitions (`agk-reviewer`, `agk-researcher`) under `kit/.agents/agents/`.
- Add `agk scan` (`src/scanner.mjs`) to auto-discover stack/commands into `.agents/memory/` and detect stale memory in `agk verify`.
- Add `agk plugin build` and `agk plugin install` (`src/plugin.mjs`) to package the toolkit as a native Antigravity plugin.
- Add `agk export` (`src/export.mjs`) to generate `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md`.
- Add `--profile standard|minimal` to `agk install`.
- Add `agk check-ste` (`src/ste-check.mjs`), behavioral eval tests (`tests/evals.test.mjs`), `--live` check in `agk mcp doctor`, and GitHub Actions CI (`.github/workflows/ci.yml`).

## 0.2.0

- Add always-on rule `coding-principles` (think before coding, simplicity first, surgical changes, goal-driven execution), replaces `thinking-and-goals`.
- Add always-on rule `simplified-technical-english` (ASD-STE100 style). No official dictionary is bundled and no compliance checker exists.
- `review` skill now flags changed lines that do not trace to the request.

## 0.1.0

Initial implementation.

- Installer (`agk install | verify | uninstall`) with hash manifest, dry-run, local-only git excludes (worktree-safe).
- Skills: plan, implement, review, commit-prep, github, perplexity-research, project-memory.
- Rules: thinking & goals, security & review, clear writing (`model_decision`).
- Optional project memory templates.
- MCP setup for GitHub (read-only by default) and Perplexity, with `doctor`.
- 20 automated tests using temp dirs; no network or credentials needed.

### Known limitations / planned

- No Jira/Confluence skills yet (add as new MCP entries + skills).
- No local inventory/search CLI (`build/query/search/diff`); memory is searched with `rg` via the `project-memory` skill.
- No dedicated subagent definitions; the workflow lives in skills.
- Not validated against a live Antigravity session or live MCP endpoints.
