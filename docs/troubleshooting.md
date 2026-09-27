# Troubleshooting

<details>
<summary><strong>Verify fails with MISSING_SHARDS</strong></summary>

A shard job failed or its artifact upload failed. The error lists the shard
ids; open those shard jobs' logs. Rerun with the same workload — the plan is
deterministic, so surviving shards' artifacts stay valid (see
[retries.md](retries.md)).
</details>

<details>
<summary><strong>Verify fails with MISSING_TASKS / DUPLICATE_TASKS</strong></summary>

A worker reported fewer completed tasks than its manifest, or reported an id
twice. The most common cause is a worker that never writes
`$ACTION_BUNDLE_COMPLETIONS` — exiting 0 alone completes nothing (see
[worker-contract.md](worker-contract.md)). Otherwise the worker stopped
partway through. The error details list the exact task ids.
</details>

<details>
<summary><strong>Verify fails with FAILED_SHARD</strong></summary>

The shard's worker command exited non-zero, timed out, or wrote a malformed
`completions.json`. The shard job itself is also red; `error.details.error`
carries the recorded reason. A failed shard never passes verification, even
if its task ids look complete.
</details>

<details>
<summary><strong>Verify fails with SHARD_ASSIGNMENT_MISMATCH</strong></summary>

A shard reported task ids that belong to a different shard. Workers must
process only the tasks in their own `$ACTION_BUNDLE_MANIFEST`, not the global
workload.
</details>

<details>
<summary><strong>Verify fails with RUN_ID_MISMATCH / MANIFEST_DIGEST_MISMATCH</strong></summary>

A shard result belongs to another run or another manifest — usually
artifacts from different runs were mixed while retrying by hand. Only merge
artifacts produced from an identical workload and shard count (see
[retries.md](retries.md)).
</details>

<details>
<summary><strong>Verify fails with UNEXPECTED_SHARD_COUNT</strong></summary>

`--shard-count` does not match the number of results, or the manifests were
planned with a different shard count than `--shard-count`. Pass the plan's
`shard_count` output unchanged.
</details>

<details>
<summary><strong>Verify fails: "shards reported success but did not produce …"</strong></summary>

With `--expect-output` (set automatically by the reusable workflow), every
successful shard must have written the file its reducer needs. Write it into
`$ACTION_BUNDLE_OUTPUT_DIR`, or switch the reducer.
</details>

<details>
<summary><strong>Plan fails with PLANNING_ERROR</strong></summary>

The workload is invalid: an unknown `kind`, `items`/`tasks` that are not
arrays, or a task id that is empty or longer than 4096 characters. Planning
rejects these up front so no shard is started with a manifest it cannot load.
</details>

<details>
<summary><strong>"worker cwd does not exist"</strong></summary>

`--cwd` must point to an existing directory. In the reusable workflow this
is the caller checkout `workspace/`; custom worker commands run there, so
reference your scripts relative to your own repository root.
</details>

<details>
<summary><strong>Reduce fails: "shard N missing expected output output.json"</strong></summary>

The reducer strategy does not match what your worker writes. `json-array` and
`json-object` expect `output.json`; `concat` expects `output.txt`;
`files` expects `files/`. Either write the expected file or use a custom
`--command` reducer.
</details>

<details>
<summary><strong>More shards made it slower</strong></summary>

Expected below a workload-size threshold: every shard pays runner boot +
checkout + setup + artifact transfer (~60s here). Compute must be minutes per
shard for sharding to pay off — see [benchmarks](../benchmarks/README.md).
</details>

