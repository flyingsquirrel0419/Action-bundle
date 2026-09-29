<div align="center">

# Action-bundle

**Turn GitHub Actions into a distributed compute pool.**

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [简体中文](README_ZH.md) · [Español](README_ES.md)

[![action-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

Give Action-bundle one workload. GitHub Actions runs it in parallel across
many runners. You get one verified result back.

```
                 ┌─ Runner 0 ─┐
Workload ─ Split ├─ Runner 1 ─┼─ Collect ─ Verify ─ Reduce ─ Result
                 ├─ Runner 2 ─┤
                 └─ Runner N ─┘
```

GitHub Actions' `matrix` creates parallel jobs; Action-bundle is the layer
above it that handles the parts everyone rewrites by hand — deterministic
partitioning, a versioned per-shard manifest, a language-agnostic worker
contract, artifact collection, completeness verification, and reduction —
so you never design matrix plumbing again.

## 30-second quickstart

Use the reusable workflow from any repository (no library install):

```yaml
# .github/workflows/distribute.yml
name: distribute
on:
  workflow_dispatch:

jobs:
  compute:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/run.yml@main
    with:
      workload: '{"kind":"index","count":2000}'
      shards: "8"
      reducer: "json-array"
```

The run splits 2,000 tasks across 8 runners, executes the bundled demo worker,
verifies that every planned task was reported complete exactly once — with each
result bound to its expected shard and manifest — and uploads `final-result.json`.
To run **your** code instead of the demo worker, pass `command` (and
optionally `reduce_command`) to the same reusable workflow — they run in a
checkout of your repository:

```yaml
    with:
      workload: '{"kind":"list","items":["a.py","b.py","c.py"]}'
      shards: "4"
      command: "python3 scripts/process.py"      # your worker
      reduce_command: "python3 scripts/merge.py" # optional custom merger
```

See [docs/github-actions.md](docs/github-actions.md) for details, or use the
library + CLI to build a workflow of your own.

## The pieces

| | |
|---|---|
| **Planner** | Turns a workload (index range, list, or explicit tasks) + shard count (or `auto`) into a deterministic execution plan |
| **Partitioner** | `sha1(taskId) % shards` — same input, same assignment, every run |
| **Manifest** | Versioned JSON per shard: `{version, runId, shardIndex, shardCount, tasks}` |
| **Worker** | Your command, any language, with `ACTION_BUNDLE_*` env vars set |
| **Collector** | Downloads every shard's `result-meta.json` |
| **Verifier** | Fails loudly on missing/duplicate shards or tasks, with actionable details |
| **Reducer** | `concat`, `json-array`, `json-object`, `files`, `none`, or your own command |

## CLI

```bash
npm install action-bundle   # or npx action-bundle ...

# See how a workload would be split
action-bundle plan workload.json --shards 8

# The three commands the workflow uses internally
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/
action-bundle reduce --parts-dir parts/ --shard-count 8 --strategy json-array --out result.json
```

Exit codes: `0` success · `2` invalid configuration/usage · `3` verification failure · `4` execution/reduction failure.

## Library

```ts
import { createPlan, partition, verifyShards, reduceResults } from "action-bundle";

const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: "auto" });
```

Full API: [docs/library.md](docs/library.md). Worker environment variables:
[docs/worker-contract.md](docs/worker-contract.md).

## Benchmark (measured, not marketed)

Real GitHub-hosted runners, 20,000 CPU-bound tasks (~7ms each), median of 3
runs per shard count:

| Shards | Compute (slowest shard) | Full run wall-clock | Speedup |
|---|---|---|---|
| 1 | 136s | 186s | 1.0x |
| 4 | 46s | 93s | 3.0x |
| 16 | 12s | 63s | 11.3x |

Compute shrinks with shard count (capped by the slowest runner in the matrix);
wall-clock does not, because every run pays ~50s of fixed overhead (runner
boot, checkouts, setup, artifact transfer).
**Shard when per-shard compute is minutes, not seconds.** Methodology and run
links: [benchmarks/README.md](benchmarks/README.md).

## When to use it

Workloads that already belong in CI and take long enough to matter: large test
suites, build matrices, static analysis over many files, batch repository
processing, code generation, data preparation.

When **not**: sub-minute jobs (overhead dominates), and anything outside
GitHub's usage policies — this is for legitimate repository workloads, not a
free compute farm. Action-bundle is not Kubernetes/Ray/Spark; it is the thin
layer for work that already lives in GitHub Actions.

## Docs

- [docs/concepts.md](docs/concepts.md) — the mental model
- [docs/getting-started.md](docs/getting-started.md) — adopt it in your repo
- [docs/github-actions.md](docs/github-actions.md) — workflows, limits, custom workers
- [docs/cli.md](docs/cli.md) · [docs/library.md](docs/library.md)
- [docs/reducers.md](docs/reducers.md) · [docs/worker-contract.md](docs/worker-contract.md)
- [docs/architecture.md](docs/architecture.md) — why matrix + artifacts, no server
- [docs/retries.md](docs/retries.md) — what retry/resume looks like today
- [docs/security.md](docs/security.md) · [docs/troubleshooting.md](docs/troubleshooting.md)

## Contributing / Security / License

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)
