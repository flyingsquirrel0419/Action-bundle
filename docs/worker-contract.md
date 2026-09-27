# Worker contract

A worker is any executable command. Action-bundle sets these environment
variables before running it:

| Variable | Meaning |
|---|---|
| `ACTION_BUNDLE_SHARD_INDEX` | This worker's shard number (0-based) |
| `ACTION_BUNDLE_SHARD_COUNT` | Total shard count |
| `ACTION_BUNDLE_RUN_ID` | Stable id of the whole run |
| `ACTION_BUNDLE_MANIFEST` | Path to this shard's manifest JSON |
| `ACTION_BUNDLE_OUTPUT_DIR` | Directory the worker must write outputs into |
| `ACTION_BUNDLE_COMPLETIONS` | Path to write the completion report (`completions.json`) |

## What a worker must do

1. Read the manifest (`{version, runId, shardIndex, shardCount, tasks[]}`).
2. Process its tasks.
3. Write workload output into `$ACTION_BUNDLE_OUTPUT_DIR`:
   - `output.json` for `json-array` / `json-object` reducers
   - `output.txt` for the `concat` reducer
   - `files/` for the `files` reducer
4. **Report completions** to `$ACTION_BUNDLE_COMPLETIONS`:

   ```json
   {"completedTaskIds": ["task-a", "task-b"]}
   ```

5. Exit 0 on success, non-zero on failure. Output goes straight to the job
   log as it is written. The command is stopped after 30 minutes by
   default (`timeoutMs` in the library); the whole process group is
   terminated.

## Completion report semantics

| Situation | Result |
|---|---|
| Stale file from an earlier run in the same output dir | Deleted before the command starts — never counted |
| No completions file | Nothing is considered complete (verification fails with `MISSING_TASKS`) |
| Malformed file (not an array of unique strings) | Shard is marked `failed`, verification fails with `FAILED_SHARD` |
| Partial list | Only the reported ids count as complete |
| Non-zero exit | Shard marked `failed`; verification always fails |

Exiting 0 no longer implies all tasks done — completions must be reported
explicitly. Action-bundle records what the worker *reported*; it cannot prove
arbitrary computation was correct, and does not claim to.

Action-bundle writes `result-meta.json` (status, timings, completed task ids)
next to your outputs — that file is what the collector and verifier consume.
All `ACTION_BUNDLE_*` paths are absolute, because the command may run in a
different working directory (`--cwd`, e.g. the caller workspace).

Use a fresh, empty output directory for every run. Action-bundle removes a
stale `completions.json` itself, but it does not delete your own output
files: an `output.json` left over from a previous run in the same
`--out-dir` would satisfy `verify --expect-output` even if this run never
wrote one. The reusable workflow always starts from an empty runner.

## Local dry-run

```bash
export ACTION_BUNDLE_MANIFEST=manifest-0.json
export ACTION_BUNDLE_OUTPUT_DIR=/tmp/shard-0
export ACTION_BUNDLE_COMPLETIONS=/tmp/shard-0/completions.json
export ACTION_BUNDLE_SHARD_INDEX=0 ACTION_BUNDLE_SHARD_COUNT=4
python3 examples/python/worker.py
```
