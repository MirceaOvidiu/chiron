---
trigger: model_decision
description: Apply when handling credentials, user input, auth, network calls, or reviewing code for security.
---

# Security

- Apply relevant OWASP principles: validate input, encode output, parameterize queries, least privilege.
- Never print, log, persist, or commit secrets or tokens. Read them from the environment or a secret store.
- Surface failures; do not swallow errors or fail open on auth/validation.
- Do not send secrets or proprietary data to external services (including search/research tools).
- Review priority: correctness, regressions, security, missing tests.
