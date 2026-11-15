---
trigger: always_on
---

# Coding principles

Four behavior rules that prevent common LLM coding mistakes. They follow the widely shared
"Karpathy skills" guidelines (community summary of Andrej Karpathy's observations), written in our own words.

## 1. Think before coding

- Do not assume. State your assumptions.
- If a request has more than one valid meaning, show the options. Do not pick one in silence.
- If something is unclear, stop and ask.
- If a simpler approach exists, say so. Push back on needless complexity.

## 2. Simplicity first

- Write the minimum code that solves the problem.
- Add no feature, option, or abstraction that nobody asked for.
- Add no error handling for cases that cannot occur.
- Test: would a senior engineer call this overcomplicated? If yes, simplify.

## 3. Surgical changes

- Change only what the task needs. Match the existing style.
- Do not refactor, reformat, or "improve" code next to your change.
- Remove only the unused code that your own change made unused. Mention other dead code. Do not delete it.
- Test: every changed line must trace to the request.

## 4. Goal-driven execution

- Turn the task into a check that you can verify. Example: "write a test that fails for the bug, then make it pass".
- For many steps, write a short plan. Give each step a check.
- Loop until the check passes. Do not report success without running it.
