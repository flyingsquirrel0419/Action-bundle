# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x (latest) | ✓ |
| 0.1.x | ✗ |

## Reporting a vulnerability

Do not open public GitHub issues for security vulnerabilities.

Preferred channel: use this repository's **Security → Report a vulnerability**
(GitHub private vulnerability reporting).

What to include:

- Affected version/commit
- Reproduction steps or PoC
- Impact (e.g. verification bypass, workflow privilege escalation)
- Sanitize any logs containing secrets

This is a side project, so no response-time promise, but reports are read
and answered.

## Scope

Security boundaries this project handles:

- `part-N.json` / `result-meta.json` / final results are CI artifacts.
  Never put secrets into worker outputs.
- The reusable workflow requests `contents: read` only. If a calling
  repository needs more, it must raise its own `permissions:` explicitly.
- Downloaded artifacts are treated as untrusted input: the collector and
  verifier validate manifest version, shard ids, task-id coverage, and
  result structure before reduction.
- Worker commands are arbitrary code by design. Do not run the workflow
  with write permissions or secrets on untrusted (fork) pull requests.

See [docs/security.md](docs/security.md) for the full threat model.

