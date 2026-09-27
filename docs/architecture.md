# Architecture

## What Action-bundle is built on

GitHub-native primitives only: matrix jobs, artifacts, reusable workflows.
There is no server, database, queue, or daemon — the runner you already have
is the compute pool, and artifacts are the state transport.

```
setup job ──▶ plan.json + manifest-N.json (artifact: ab-manifests)
    │
shard jobs (matrix) ──▶ out/ per shard (artifact: shard-N)
    │
aggregate job ──▶ download all ─▶ verify ─▶ reduce ─▶ final-result (artifact)
```

## Why artifacts, not cache or outputs

- `actions/cache` is eventually consistent and can silently miss — wrong
  tool for aggregation.
- Job `outputs` are strings with size limits — wrong tool for bulk results.
- Artifacts are durable per-run storage with exact names — right tool, with
  the tradeoff of upload/download overhead (see
  [benchmarks](../benchmarks/README.md)).

## Why no coordinator server

A coordinator would enable smarter scheduling and live retries, but adds
infrastructure every user must run. The manifest + verifier already give
deterministic assignment and provable completeness without one. Retry and
resume are built on top of that (see [retries.md](retries.md)).

## Module map

| `src/` | Role |
|---|---|
| `task.ts` | Workload shapes → concrete tasks with stable ids |
| `partition.ts` | Deterministic assignment |
| `planner.ts` | Shard-count selection (explicit or `auto`) |
| `manifest.ts` | Versioned manifest schema + validation |
| `worker.ts` | Worker execution, env contract, result metadata |
| `collector.ts` | Gather shard results from a directory |
| `verify.ts` | Completeness proof |
| `reduce.ts` | Built-in + custom reducers |
| `errors.ts` | Structured error hierarchy |
| `cli.ts` | plan / worker / verify / reduce |

