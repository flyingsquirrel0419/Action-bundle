# Shell worker example

Uses `jq` to emit one JSON line per task to `output.txt`
(pair with the `concat` reducer).

```bash
export ACTION_BUNDLE_MANIFEST=/path/to/manifest-0.json
export ACTION_BUNDLE_OUTPUT_DIR=/tmp/shard-0
bash examples/shell/worker.sh
```

