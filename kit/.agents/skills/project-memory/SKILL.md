---
name: project-memory
description: >-
  Use when the user asks to record, update, or look up durable project knowledge
  (architecture, conventions, decisions, operational notes), or when starting work in a
  repo that has a .agents/memory directory.
---

# Project memory

Memory lives in `.agents/memory/*.md` (installed with `agk install --memory`) and is **local-only**:
the installer adds it to `.git/info/exclude` so it is not committed by accident.

- **Look up**: search the memory files by keyword (`rg -n "<term>" .agents/memory`) and read the
  matching sections before answering project-specific questions. Cite the file.
- **Update**: record only facts verified in the code or confirmed by the user. Never invent project
  facts; leave the template placeholder if unknown. Keep entries short, dated, and sourced
  (file path or user statement). Decisions go in `decisions.md` as short ADR-style entries.
- **Share**: if the user wants a note in version control, tell them and move it explicitly to a
  tracked location (e.g. `docs/`); do not change the ignore rules yourself.
- Never store credentials, tokens, or personal data in memory files.
