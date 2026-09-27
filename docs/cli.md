# CLI reference

`action-bundle` ships four commands. Exit codes: `0` success, `2` invalid
config/usage, `3` verification failure, `4` execution/reduction failure.

## plan

```bash
action-bundle plan workload.json --shards 8 [--max-shards 32] [--min-tasks-per-shard 1] [--out plan.json]
```

Prints the execution plan (run id, task count, shard count, tasks per shard).
`--shards auto` picks the largest shard count that keeps
`min-tasks-per-shard` satisfied, capped by `max-shards`.

Workload file formats:

```json
{"kind": "index", "count": 1000}
{"kind": "list", "items": ["a.py", "b.py"]}
{"kind": "tasks", "tasks": [{"id": "task-a", "input": "..."}]}
```

## worker

```bash
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out
```

Writes `manifest.json` into `out`, sets the `ACTION_BUNDLE_*` environment,
runs the command, then writes `result-meta.json`. See
[worker-contract.md](worker-contract.md).

## verify

```bash
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/
```

Reads every `parts/shard-N/result-meta.json` and proves: all shards present,
no duplicates, task coverage exactly matches the manifests. On failure it
prints structured details (missing/duplicate task ids) and exits 3.

## reduce

```bash
action-bundle reduce --parts-dir parts/ --shard-count 8 [--strategy json-array] [--command "..."] --out result.json
```

See [reducers.md](reducers.md).

