# Benchmarks

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

Measured on 2026-09-29 against commit `15a0cb6` (current architecture:
runtime/workspace split, runtime identity check, completion protocol).
20,000 items × intensity 10,000 (~7ms CPU/item), 3 runs per shard count,
run one at a time and interleaved (1 → 4 → 16, three rounds).

### Median

| Shards | Compute (slowest shard) | Full run wall-clock | Compute speedup | Parallel efficiency |
|---|---|---|---|---|
| 1 | 136s | 186s | 1.0x | 100% |
| 4 | 46s | 93s | 3.0x | 74% |
| 16 | 12s | 63s | 11.3x | 71% |

speedup = median T1 / median TN; parallel efficiency = speedup / N. Every run
verified 20000/20000 tasks.

### Individual runs

| Shards | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| 1 | 179s / 258s · [36518737722](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36518737722) | 135s / 186s · [36519295408](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36519295408) | 136s / 184s · [36519934036](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36519934036) |
| 4 | 48s / 93s · [36519075956](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36519075956) | 46s / 124s · [36519533986](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36519533986) | 44s / 85s · [36520188229](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36520188229) |
| 16 | 12s / 59s · [36519200775](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36519200775) | 13s / 177s · [36519705723](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36519705723) | 12s / 63s · [36520300290](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36520300290) |

Cells are compute / wall-clock.

### Interpretation

- Compute shrinks with shard count, but below the ideal: the slowest shard
  sets the time, and GitHub-hosted runners differ in CPU speed. In the 4-shard
  run 36519075956 the fastest shard took 26s and the slowest 48s, while the
  partition itself is nearly even (4,880–5,113 tasks per shard; 1,201–1,312
  at 16 shards).
- Wall-clock has a fixed floor of ~50s per run (runner boot, two checkouts,
  `npm ci` + build, artifact up/download, verify + reduce) regardless of shard
  count.
- Wall-clock is also noisy because it includes runner provisioning. The 177s
  outlier (16 shards, round 2) is almost entirely a 113s wait between the
  aggregate job starting and its first step running; its steps took ~10s. That is why the table
  reports medians.
- Absolute compute is not comparable with the earlier (pre-architecture-change)
  measurement of 100s at 1 shard. The hashing code (`digestRounds`) is
  unchanged since that measurement, and the same 1-shard workload already
  varies 135–179s between runs today, so runner hardware is the most likely
  cause; this was not isolated further.
- Therefore: shard when per-shard compute is measured in minutes, not seconds.
  Below that, more shards mostly add overhead.

## Reproduce

```
Actions → action-bundle → Run workflow
  workload: {"kind":"index","count":20000}
  shards:   1 (then 4, then 16)
  intensity: 10000
```

Then compute the table from the finished runs (needs the `gh` CLI):

```bash
node scripts/bench-stats.mjs <run-id> [<run-id> ...]
```

It reads each run's jobs through the GitHub API and prints, per run, the
slowest `Run shard N` step (compute) and `run_started_at → updated_at`
(wall-clock), then the median per shard count. Set `BENCH_REPO` to measure
runs in another repository.
