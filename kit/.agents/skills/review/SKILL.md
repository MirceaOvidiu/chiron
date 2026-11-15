---
name: review
description: >-
  Use when the user asks for a code review of a diff, branch, or pull request. Finds
  actionable bugs, regressions, missing tests, and security concerns. Read-only: does
  not modify code unless asked.
---

# Review

1. Determine scope: `git diff` (staged/unstaged), `git diff <base>...HEAD`, or a PR via the `github` skill.
2. Read the changed code in context, not just the hunks.
3. Report findings ordered by severity, each with file:line, why it matters, and a concrete fix:
   - Correctness and regressions
   - Security (injection, authz, secrets, unsafe deserialization, error leakage)
   - Missing or weak tests
   - Maintainability issues only when they will plausibly cause defects
4. Flag changed lines that do not trace to the stated goal (unrelated refactors, reformatting, speculative
   features). Check that the change is as small and simple as it can be.
5. Skip style nitpicks that a formatter or linter handles. Say "no actionable findings" when true.
6. Do not edit files or post review comments to GitHub without explicit user confirmation.
