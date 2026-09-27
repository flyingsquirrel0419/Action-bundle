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
- 19 unit + integration tests covering partition invariants (union = input,
  disjoint shards, determinism) and every verification failure mode
- Measured benchmark (20,000 CPU-bound items): 1 shard 100.0s compute →
  16 shards 6.6s; full wall-clock 127s → 68s

### Notes

- This repository started as a JSON shard/merge proof of concept and was
  rewritten into a generic distributed compute layer before any release.
  No stable release exists yet; the first tag will be cut from Unreleased.

