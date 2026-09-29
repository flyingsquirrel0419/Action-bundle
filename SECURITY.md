# Security Policy

## Supported versions

No version has been released yet. Until the first release, security fixes
land on `main` only.

| Version | Supported |
|---|---|
| `main` / 0.2.0 pre-releases | ✓ |

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
  verifier validate manifest version, shard ids (bound to the artifact
  directory), task-id coverage, result structure, and — when the workflow
  sets `--expect-output` — that a shard claiming success actually produced
  its expected output file before reduction.
- Verification proves *completeness and consistency*, not correctness of
  compute. A shard that faithfully reports its assigned task ids but lies
  about doing the work is out of scope (no Byzantine fault tolerance).
- Worker commands are arbitrary code by design. Do not run the workflow
  with write permissions or secrets on untrusted (fork) pull requests.
- **Runtime/workspace separation**: the reusable workflow checks out the
  Action-bundle runtime from the canonical Action-bundle repository into
  `runtime/` (`persist-credentials: false`), never from the caller repo.
  Caller code lives in `workspace/` and only runs as the configured worker
  command.
- **Identity binding**: results are bound to the plan via `runId` +
  `manifestDigest` (sha256 of the canonical manifest). Mixed-run artifacts,
  wrong-shard assignments, and failed shards are rejected.
- **Completion protocol**: workers report completed tasks via
  `$ACTION_BUNDLE_COMPLETIONS`; exiting 0 no longer implies all tasks done.
- Untrusted fork PR workloads should not run on persistent self-hosted
  runners — GitHub-hosted runners are ephemeral, self-hosted ones are not.

See [docs/security.md](docs/security.md) for the full threat model.
