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

A worker reported fewer/more completed tasks than its manifest. This usually
means the worker command crashed mid-way (exit 0 despite partial work) or
processed tasks outside its manifest. The error details list the exact task
ids.
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

