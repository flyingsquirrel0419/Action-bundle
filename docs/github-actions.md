# Using Action-bundle in GitHub Actions

## Reusable workflow

```yaml
jobs:
  compute:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/run.yml@main
    with:
      workload: '{"kind":"index","count":2000}'
      shards: "8"              # or "auto"
      intensity: "200"         # benchmark CPU weight
      reducer: "json-array"
```

The reusable workflow runs the bundled benchmark worker. It is the fastest
way to see the mechanics, and the reference implementation for your own
three-job setup.

## Custom worker and reducer (no fork needed)

The reusable workflow accepts `command` and `reduce_command` inputs, so a
caller repository can run its own code without forking the workflow:

```yaml
jobs:
  compute:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/run.yml@main
    with:
      workload: '{"kind":"list","items":["a.py","b.py","c.py"]}'
      shards: "4"
      reducer: "json-array"
      command: "python3 scripts/process.py"      # runs in workspace/ (your repo)
      reduce_command: "python3 scripts/merge.py" # optional custom merger
```

Your repository is checked out into `workspace/` and the worker command runs
there (`--cwd workspace`). The Action-bundle runtime is checked out separately
into `runtime/` from the exact reusable-workflow revision
(`job.workflow_repository` / `job.workflow_sha`) — caller code can never
replace the runtime.

## Rolling your own (custom worker)

Copy [.github/workflows/run.yml](../.github/workflows/run.yml) and replace
the shard step's `--command` with your program:

```yaml
- run: |
    node dist/cli.js worker \
      --manifest manifests/manifest-${{ matrix.shard }}.json \
      --out-dir out \
      --command "python3 my_worker.py"
```

## Limits and honest expectations

- The matrix is capped at 32 shards by default (`maxShards`); GitHub's own
  job-matrix limit is 256, but more shards ≠ faster (see
  [benchmarks](../benchmarks/README.md)).
- GitHub does not guarantee all matrix jobs run simultaneously; queuing is
  normal. Wall-clock time includes runner boot, checkout, setup, and artifact
  transfer per job.
- `fail-fast: false` is set so one bad shard does not cancel the rest —
  the verifier will name the missing shard precisely.
- Permissions default to `contents: read`. Raise them only if your worker
  needs more.
