# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

Nothing is released yet — everything below is unreleased.

## [Unreleased]

### Added

- Core modules: `task` (index/list/explicit workloads), `partition`
  (deterministic `sha1 % shards`), `planner` (explicit or `auto` shard
  count), `manifest` (versioned schema), `worker` (language-agnostic
  contract with `ACTION_BUNDLE_*` env), `collector`, `verify`
  (completeness proof), `reduce` (built-in + custom reducers)
- Structured error hierarchy with machine-readable codes
  (`MISSING_SHARDS`, `DUPLICATE_TASKS`, `INCOMPATIBLE_VERSION`, ...)
- CLI: `plan` / `worker` / `verify` / `reduce` with documented exit codes
- Reusable workflow `.github/workflows/run.yml` (setup → shard matrix →
  aggregate with verification + reduction)
- CI on Node 20/22/24 + packed-tarball smoke test
- Examples: Python / Node / shell workers, benchmark workload
- Docs suite: concepts, getting-started, github-actions, cli, library,
  architecture, reducers, worker-contract, retries, security, troubleshooting
- CLI `expect-output` subcommand and `verify --expect-output`: a shard that
  reports success must have produced the output its reducer needs
- `src/reducer-contract.ts` (`REDUCER_REQUIREMENTS`, `expectedOutputFor`):
  one mapping of reducer → required shard output, shared by verify and reduce
- `--cwd` for `worker` and `reduce` (`WorkerRunOptions.cwd`,
  `ReduceOptions.cwd`); must exist and be a directory
- `manifestDigest` and `canonicalize` exported from the package root
- Reusable workflow inputs `command` and `reduce_command`
- 53 unit + integration tests covering partition invariants (union = input,
  disjoint shards, determinism), every verification failure mode, worker
  failure metadata and timeouts, process-group termination, reducer cwd/env,
  and workload/flag validation
- Measured benchmark (20,000 CPU-bound items): 1 shard 100.0s compute →
  16 shards 6.6s; full wall-clock 127s → 68s (historical — measured before
  the runtime/workspace split, see `benchmarks/README.md`)

### Security

- Reusable workflow no longer builds or runs the runtime from the caller's
  repository. The Action-bundle runtime is checked out into `runtime/` from
  `job.workflow_repository` at `job.workflow_sha` (the exact callee
  revision); caller code is checked out separately into `workspace/` and
  only runs as the worker / custom reducer command. All checkouts use
  `persist-credentials: false`. Each job first asserts that
  `job.workflow_repository` is non-empty and `job.workflow_sha` is a full
  SHA, so an empty context fails the job instead of silently checking out
  the caller's repository.
- Result metadata schema v2 binds every shard result to its plan: `runId`
  and `manifestDigest` (sha256 of the canonical manifest). New verification
  codes `RUN_ID_MISMATCH`, `MANIFEST_DIGEST_MISMATCH`, `FAILED_SHARD`,
  `SHARD_ASSIGNMENT_MISMATCH`.
- Completion protocol: workers report finished tasks in
  `$ACTION_BUNDLE_COMPLETIONS`; exiting 0 no longer implies all tasks are
  done. Malformed completion files mark the shard failed, and a stale
  `completions.json` left in the output directory is deleted before the
  command runs.
- Verification requires each shard to report exactly its own planned tasks,
  its result `taskCount` to match its manifest, and the manifests' declared
  shard count to equal `--shard-count` (a subset of a larger plan no longer
  verifies as complete).
- Strict validation of untrusted `result-meta.json` and manifests (version,
  integer ranges, status enum, duplicate ids, id length); result identity
  is bound to the artifact directory it was read from.
- Resource limits: 1,000,000-task ceiling, 64 MB per-shard and 256 MB total
  reducer input, O(n) verification, `json-object` rejects prototype keys
  and cross-shard duplicate keys; job-level `timeout-minutes` in the workflow.
- `runId` includes canonical task inputs, so identical ids with different
  inputs get different identities. Ids are JSON-encoded before hashing, so an
  id containing the internal separator can no longer collide with a
  different id+input pair (run ids differ from earlier builds).
- Timed-out or interrupted worker/reducer commands are terminated as a whole
  process group (SIGTERM, then SIGKILL after a 5 s grace — `killGraceMs`
  in the library, `ACTION_BUNDLE_KILL_GRACE_MS` for the CLI); background
  children no longer outlive the command. The CLI sets `process.exitCode`
  instead of calling `process.exit()` so a pending SIGKILL still fires.
  The grace period starts at the first termination request; repeated
  signals no longer postpone the SIGKILL.
- A custom reducer's output path is cleared before the command runs, so a
  result file left over from an earlier run can no longer satisfy the
  "exited 0 but did not create" postcondition.

### Changed

- A failing worker command now fails the shard step (`WorkerError`, exit 4)
  after writing `result-meta.json` with `status: failed`; the aggregate job
  still runs and reports the failed shard.
- `ACTION_BUNDLE_*` paths for workers and custom reducers are absolute.
- Planning rejects invalid workloads with `PLANNING_ERROR` (exit 2): unknown
  `kind`, non-array `items`/`tasks`, non-string, empty, or >4096-character
  task ids. Previously some of these were accepted and only failed later in
  the shard job, or crashed with a raw `TypeError`.
- Worker and custom reducer commands stream stdout/stderr live (inherited
  stdio) instead of buffering it until exit; the 64 MB output buffer limit
  that failed chatty workers is gone.
- `--shard-count`, `--shards`, `--max-shards`, and `--min-tasks-per-shard`
  are validated as positive integers (exit 2); `createPlan` rejects
  non-integer `maxShards` / `minTasksPerShard` with `PLANNING_ERROR`.
  Previously a non-numeric `--max-shards` disabled the cap or crashed
  `auto` planning.

### Fixed

- Push-triggered runs fall back to workflow defaults (inputs are empty
  outside `workflow_dispatch`).
- Default benchmark worker path when the worker runs in `workspace/`.
- Test script runs on Node 20 (explicit test files, no glob).

### Notes

- This repository started as a JSON shard/merge proof of concept and was
  rewritten into a generic distributed compute layer before any release.
  No stable release exists yet; the first tag will be cut from Unreleased.

