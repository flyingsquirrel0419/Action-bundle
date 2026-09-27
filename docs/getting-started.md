# Getting started

## Option A: reusable workflow (zero install)

```yaml
jobs:
  compute:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/run.yml@main
    with:
      workload: '{"kind":"index","count":2000}'
      shards: "8"
```

This runs the bundled benchmark worker. To run **your** code, use option B.

## Option B: your own worker (library + CLI)

1. `npm install action-bundle` (or run via `npx`).
2. Write a worker — any program that reads the manifest and writes
   `output.json` (or `output.txt`, or files) into `$ACTION_BUNDLE_OUTPUT_DIR`.
   Ready-made examples: [examples/python](../examples/python/),
   [examples/node](../examples/node/), [examples/shell](../examples/shell/).
3. Copy the three-job shape from
   [.github/workflows/run.yml](../.github/workflows/run.yml):
   `setup` (plan + manifests) → `shard` (matrix, runs your command via
   `action-bundle worker`) → `aggregate` (`verify` + `reduce`).

The acceptance bar: you never write partitioning, matrix generation, artifact
naming, collection, or merge-orchestration code yourself. If you find that you
must, open an issue — that is a bug in the abstraction.

