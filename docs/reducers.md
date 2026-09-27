# Reducers

Reduction turns verified shard outputs into one artifact.

| Strategy | Input expected | Output |
|---|---|---|
| `concat` | `shard-N/output.txt` | All files concatenated, in shard order |
| `json-array` | `shard-N/output.json` (array or value) | One merged JSON array |
| `json-object` | `shard-N/output.json` (object) | Shallow-merged JSON object |
| `files` | `shard-N/files/*` | JSON manifest of file listings |
| `none` | — | Skip reduction |
| custom command | anything | Whatever your command writes |

## Custom reducer

```bash
action-bundle reduce \
  --parts-dir parts/ --shard-count 8 \
  --command "python3 scripts/merge.py" \
  --out final.json
```

The custom command receives:

| Variable | Meaning |
|---|---|
| `ACTION_BUNDLE_RESULTS` | Directory containing `shard-N/` subdirectories |
| `ACTION_BUNDLE_OUTPUT` | Where to write the final artifact |
| `ACTION_BUNDLE_SHARD_COUNT` | Shard count |

Reduction failures raise `ReductionError` (CLI exit code 4).

