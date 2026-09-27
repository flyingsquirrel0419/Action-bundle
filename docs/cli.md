# CLI reference

`action-bundle` ships five commands. Exit codes: `0` success, `2` invalid
config/usage, `3` verification failure, `4` execution/reduction failure.

`ACTION_BUNDLE_KILL_GRACE_MS` (optional) sets how long a timed-out or
interrupted worker/reducer command gets between SIGTERM and SIGKILL of its
process group. Default 5000.

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
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out [--cwd workspace]
```

Writes `manifest.json` into `out`, clears any stale `completions.json`, sets
the `ACTION_BUNDLE_*` environment (absolute paths), runs the command, then
writes `result-meta.json`. `--cwd` runs the command in another directory
(the reusable workflow uses the caller's `workspace/`); it must exist and be
a directory. A failing command still writes `result-meta.json` with
`status: failed`, then exits 4. See [worker-contract.md](worker-contract.md).

## verify

```bash
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/ [--expect-output output.json]
```

Reads every `parts/shard-N/result-meta.json` and checks, in order: the
manifests agree on run id, version and shard count (which must equal
`--shard-count`); each result is bound to its run (`runId`) and its exact
manifest (`manifestDigest`); no shard reported `failed`; each shard reported
exactly its own planned tasks; global coverage matches the manifests.
`--expect-output` additionally requires every successful shard to have
produced that file or directory. On failure it prints structured details
and exits 3.

## reduce

```bash
action-bundle reduce --parts-dir parts/ --shard-count 8 [--strategy json-array] [--command "..."] [--cwd workspace] --out result.json
```

See [reducers.md](reducers.md).

## expect-output

```bash
action-bundle expect-output --reducer json-array   # prints: output.json
```

Prints the per-shard output a built-in reducer requires (`output.json`,
`output.txt`, `files`), or nothing for `none`. The workflow feeds this to
`verify --expect-output` so verification and reduction share one contract
(`src/reducer-contract.ts`).

