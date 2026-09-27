# Security model

Also see [SECURITY.md](../SECURITY.md) for reporting.

## Scope

- Shard artifacts (`shard-N/`) are CI artifacts: never put secrets in
  `output.json` or any worker output.
- The reusable workflow requests `contents: read` only.
- Worker commands run with your repository's `GITHUB_TOKEN` permissions —
  treat third-party worker code like any CI code.

## Artifact trust boundary

Downloaded artifacts are untrusted input. The verifier and collector check:
manifest version equality, shard id sanity, task-id coverage, and structural
shape of `result-meta.json` before anything is reduced.

## Untrusted PRs

Do not run this workflow with write permissions or secrets on
`pull_request` from forks — the worker command is arbitrary code by design.
Use `workflow_dispatch`/protected branches for anything sensitive.

