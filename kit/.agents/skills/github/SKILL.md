---
name: github
description: >-
  Use when the user asks about GitHub issues, pull requests, repositories, code search,
  or Actions runs. Uses the agk-github MCP server (read-only by default); external writes
  require explicit user confirmation.
---

# GitHub (via MCP)

Server: `agk-github` (installed by `agk mcp install`). Tool names vary by server version, so
list the available tools first instead of assuming names.

## Rules

- **Verify availability.** If no `agk-github` tools are present, stop and tell the user to run
  `agk mcp install` and check Additional Options (...) > MCP Servers. Do not improvise with scraped HTTP.
- **Read first.** Gather issue/PR/diff/check status before suggesting anything.
- **Confirm before any write**: creating or editing issues, comments, reviews, PRs, branches, or
  merging. Show the exact payload (title, body, target repo) and wait for a clear "yes".
  The default server URL is the read-only toolset, so writes need `agk mcp install --github-write --force`.
- **Never print, store, or commit tokens.** Authentication is handled by the client (OAuth) or the
  user's environment.
- Prefer the repo inferred from `git remote get-url origin`; confirm it if ambiguous.

## Limitations

Rate limits and org policies may block tools; report the error verbatim rather than retrying in loops.
