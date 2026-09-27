# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0-beta.1] - 2026-09-27

Full rewrite: Action-bundle is now a generic distributed compute layer on
top of GitHub Actions, not a JSON shard/merge helper.

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

### Changed (breaking)

- v1 API (`runShard`, `runShardToFile`, `bundleParts`, `bundleFromDir`,
  numeric `shardOf`) removed — replaced by the worker-command model
- CLI commands `work` / `bundle` replaced by `plan` / `worker` /
  `verify` / `reduce`
- English is the documentation language; Korean/Chinese READMEs removed

### Removed

- Python reference implementation (`tools/`), `docs/usage.md`,
  `examples/use-bundle.yml`, `PLAN.md`

## [0.1.0] - 2026-09-27

### Added

- Initial proof of concept: shard a workload across a GitHub Actions matrix,
  merge JSON results, verify coverage
- Measured benchmark (20,000 items): 1 shard 100.0s compute → 16 shards
  6.6s; full wall-clock 127s → 68s

[Unreleased]: https://github.com/flyingsquirrel0419/Action-bundle/compare/v0.2.0-beta.1...HEAD
[0.2.0-beta.1]: https://github.com/flyingsquirrel0419/Action-bundle/compare/v0.1.0...v0.2.0-beta.1
[0.1.0]: https://github.com/flyingsquirrel0419/Action-bundle/releases/tag/v0.1.0

