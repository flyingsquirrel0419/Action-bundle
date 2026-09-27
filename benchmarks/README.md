# Benchmarks

> **Historical.** These numbers were measured with an earlier workflow
> architecture (before runtime/workspace separation, completion protocol, and
> failure-handling). They remain directionally valid for compute scaling but
> the exact wall-clock overhead has changed. The current architecture will be
> re-benchmarked before a stable release.

## Methodology

Benchmarks run on GitHub-hosted `ubuntu-latest` runners through the real
reusable workflow ([.github/workflows/run.yml](../.github/workflows/run.yml)).
The workload is CPU-bound hashing (`digestRounds`), `workload.count` tasks ×
`intensity` sha256 rounds each. Numbers come from the actual workflow runs
linked below — nothing is extrapolated.

Two time measures are reported separately, because they answer different
questions:

- **Compute (slowest shard)**: time the slowest shard job spent executing
  tasks. This is what parallelization shrinks.
- **Full run wall-clock**: end-to-end run duration including runner boot,
  checkout, `npm ci` + build, artifact transfer, verification and reduction.
  This is what a user actually waits for, and it has a fixed floor.

## Results

### v1 benchmark (20000 items × intensity 10000, ~5ms CPU/item)

| Shards | Compute (slowest shard) | Full run wall-clock | Ideal speedup | Run |
|---|---|---|---|---|
| 1 | 100.0s | 127s | 1.0x | [36290116153](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36290116153) |
| 4 | 25.9s | 87s | 3.6x | [36290117427](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36290117427) |
| 16 | 6.6s | 68s | 14.0x | [36290118749](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36290118749) |

speedup = T1 / TN; parallel efficiency = speedup / N (16 shards: 14.0/16 = 87%).

### Interpretation

- Compute scales close to linearly with shard count — that is the free
  parallelism public repositories get.
- Wall-clock does not: every run pays ~60s of fixed overhead regardless of
  shard count (runner boot, checkout, npm ci + build, artifact up/download).
- Therefore: shard when per-shard compute is measured in minutes, not seconds.
  Below that, more shards mostly add overhead.

## Reproduce

```
Actions → action-bundle → Run workflow
  workload: {"kind":"index","count":20000}
  shards:   1 (then 4, then 16)
  intensity: 10000
```

Each run's Step Summary shows the per-shard table plus the serial-vs-parallel
estimate automatically.
