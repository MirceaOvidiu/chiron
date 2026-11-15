---
name: implement
description: >-
  Use when the user asks to implement, fix, or refactor code, especially after a plan
  was agreed. Makes scoped changes that follow project conventions and runs the
  relevant checks.
---

# Implement

1. Confirm the success criteria (from a plan or the request). If none exist, write them down first.
2. Discover how the project builds and tests (build files, CI config, README). Use the project's own commands.
3. Make the smallest change that meets the criteria. Match existing style and patterns; do not
   reformat or refactor unrelated code.
4. Add or update tests for changed behavior.
5. Run the relevant tests/build/lint. Fix failures you caused; report pre-existing failures separately.
6. Summarize: what changed, how it was verified, anything not verified. Do not commit unless asked
   (see `commit-prep`).
