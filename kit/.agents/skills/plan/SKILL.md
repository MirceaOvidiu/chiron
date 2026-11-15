---
name: plan
description: >-
  Use when the user asks to plan, scope, or design a change before coding, or when a
  task is large or ambiguous. Investigates the repository and produces a verifiable
  plan. Does not implement anything unless asked.
---

# Plan

1. Restate the goal in one or two sentences. List assumptions; ask the user only about
   ambiguities that materially change behavior or safety, otherwise choose a default and say so.
2. Investigate: read the relevant code, tests, build files, and existing conventions
   (`AGENTS.md`, `GEMINI.md`, `.agents/memory/` if present). Do not guess at structure.
3. Produce the plan:
   - **Success criteria**: observable behavior that proves the goal is met.
   - **Steps**: small, ordered, each naming the files involved.
   - **Verification**: exact commands (tests, build, lint) per step or at the end.
   - **Risks / open questions**.
4. Stop. Hand off to the `implement` skill only when the user approves.

For small tasks (one-file fix, typo) skip this skill; planning overhead is not worth it.
