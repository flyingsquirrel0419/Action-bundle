# Python worker example

The worker contract is language-agnostic: Action-bundle sets environment
variables, your command does the work and writes `output.json`.

```bash
# Local dry-run (as if this were shard 0 of 4):
export ACTION_BUNDLE_MANIFEST=/path/to/manifest-0.json
export ACTION_BUNDLE_OUTPUT_DIR=/tmp/shard-0
export ACTION_BUNDLE_SHARD_INDEX=0
export ACTION_BUNDLE_SHARD_COUNT=4
python3 examples/python/worker.py
```

In a workflow, the shard step looks like:

```yaml
- run: |
    node dist/cli.js worker \
      --manifest manifests/manifest-${{ matrix.shard }}.json \
      --out-dir out \
      --command "python3 examples/python/worker.py"
```

Environment variables provided to every worker: see
[docs/worker-contract.md](../../docs/worker-contract.md).

