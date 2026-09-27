# Benchmark example

This is the demo workload used by `.github/workflows/run.yml`.

Each task runs `digestRounds(id, intensity)` — sha256 repeated `intensity`
times — which is pure CPU with no I/O, making it a clean way to measure how
shard count affects compute time vs runner overhead.

Run a benchmark: **Actions → action-bundle → Run workflow**, and set
`workload`, `shards`, and `intensity`.

See [benchmarks/](../../benchmarks/README.md) for measured results and methodology.

