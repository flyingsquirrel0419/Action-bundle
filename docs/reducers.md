# Reducers

Reduction turns verified shard outputs into one artifact.

| Strategy | Input expected | Output |
|---|---|---|
| `concat` | `shard-N/output.txt` | All files concatenated, in shard order |
| `json-array` | `shard-N/output.json` (array or value) | One merged JSON array |
| `json-object` | `shard-N/output.json` (object) | Shallow-merged JSON object |
| `files` | `shard-N/files/` (must be a directory; may be empty) | JSON manifest of file listings |
| `none` | — | Skip reduction |
| custom command | anything | Whatever your command writes |

## Custom reducer

```bash
action-bundle reduce \
  --parts-dir parts/ --shard-count 8 \
  --command "python3 scripts/merge.py" \
  --cwd workspace \
  --out final.json
```

The custom command receives:

| Variable | Meaning |
|---|---|
| `ACTION_BUNDLE_RESULTS` | Directory containing `shard-N/` subdirectories (absolute) |
| `ACTION_BUNDLE_OUTPUT` | Where to write the final artifact (absolute) |
| `ACTION_BUNDLE_SHARD_COUNT` | Shard count |

`--cwd` sets the working directory for the custom command (e.g. the caller
workspace, so `python3 scripts/merge.py` finds your repo's files). Built-in
reducers ignore it. Any existing file at `ACTION_BUNDLE_OUTPUT` is deleted
before the command starts, so a result left over from an earlier run can
never pass for this one; a custom command that exits 0 without creating
`ACTION_BUNDLE_OUTPUT` fails with `REDUCTION_ERROR` (CLI exit code 4).

Custom reducers are arbitrary caller code, like workers — the same token
permissions apply.
