---
name: commit-prep
description: >-
  Use when the user asks to prepare, write, or make a commit. Reviews staged/unstaged
  changes, flags files that should not be committed, and drafts a message. Creates a
  commit only when the user explicitly asks.
---

# Commit preparation

1. Run `git status` and `git diff` (and `--staged`). Summarize what is included.
2. Flag anything that should not be committed: secrets, `.env` files, large binaries, build output,
   local/generated files (e.g. `.agents/memory/`, `.agents/.toolkit-manifest.json`), unrelated changes.
3. Draft a message: imperative summary line (<= 72 chars), blank line, body explaining *why*.
   Follow the repository's existing convention (check `git log -n 10`).
4. Show the message and the file list. **Only run `git commit` if the user explicitly asked for a commit.**
   Never push, amend, or rewrite history unless asked.
