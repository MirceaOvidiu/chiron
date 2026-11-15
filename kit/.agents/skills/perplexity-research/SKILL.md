---
name: perplexity-research
description: >-
  Use when the user needs up-to-date external information, library/API documentation
  lookups, or sourced research that is not in the repository. Uses the agk-perplexity
  MCP server. Do not use for questions answerable from the codebase.
---

# Perplexity research (via MCP)

Server: `agk-perplexity` (installed by `agk mcp install`; requires `PERPLEXITY_API_KEY` in the environment).

1. List available tools first; typical ones are search, ask, reason, and deep research. Pick the
   cheapest that fits: search for facts/links, ask for short answers, research only for broad questions.
2. If tools are missing or return an auth error, tell the user to run `agk mcp doctor` and set
   `PERPLEXITY_API_KEY`. Never ask the user to paste the key into chat or files.
3. Write specific queries (library name + version + exact question). Do not send proprietary code,
   customer data, or secrets to the service; paraphrase instead.
4. Report findings with source URLs. Distinguish sourced facts from your inference, and note
   when sources conflict or look outdated.
