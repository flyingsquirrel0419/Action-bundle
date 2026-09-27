# Security model

Also see [SECURITY.md](../SECURITY.md) for reporting.

## Scope

- Shard artifacts (`shard-N/`) are CI artifacts: never put secrets in
  `output.json` or any worker output.
- The reusable workflow requests `contents: read` only.
- Worker commands run with your repository's `GITHUB_TOKEN` permissions —
  treat third-party worker code like any CI code.

## Trust zones

```
runtime/    Action-bundle code, checked out from the exact reusable-workflow
            SHA (job.workflow_repository + job.workflow_sha). Trusted.
workspace/  caller repository. Worker/reducer commands run here — arbitrary
            user code, checked out with persist-credentials: false.
parts/      downloaded shard artifacts. Untrusted data, validated before reduce.
manifests/  the execution plan from the trusted setup job.
```

Caller code can never replace or impersonate the runtime.

## Artifact trust boundary

Downloaded artifacts are untrusted input. The verifier and collector check:
manifest version equality, shard identity bound to the artifact directory,
run binding (`runId` + `manifestDigest` = sha256 of the canonical manifest),
per-shard assignment (reported tasks must equal the shard's own manifest),
`taskCount` consistency, and the structural shape of `result-meta.json`
before anything is reduced.

## Completion and failure

Workers report completed tasks via `$ACTION_BUNDLE_COMPLETIONS`; exiting 0 no
longer implies all tasks done. Verification proves *reported* completeness and
consistency — not correctness of arbitrary computation (no Byzantine fault
tolerance). A shard whose command fails still uploads its
`result-meta.json` (status `failed`), the aggregate job runs, and
verification fails with `FAILED_SHARD`.

## Untrusted PRs

Do not run this workflow with write permissions or secrets on
`pull_request` from forks — the worker command is arbitrary code by design.
Use `workflow_dispatch`/protected branches for anything sensitive.
