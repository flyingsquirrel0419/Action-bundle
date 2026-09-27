# Concepts

Action-bundle is a `Split → Fan-out → Execute → Collect → Verify → Fan-in → Reduce`
pipeline built entirely on GitHub Actions primitives.

```
Workload
  │
  ▼
Planner ──▶ Plan {runId, shardCount, tasks-per-shard}
  │
  ▼
Partitioner ──▶ deterministic: sha1(taskId) % shardCount
  │
  ▼
ShardManifest (versioned JSON, one per shard)
  │
  ▼
Worker (any language; reads manifest, runs command, writes outputs + result-meta.json)
  │
  ▼
Collector ──▶ downloads shard-*/result-meta.json
  │
  ▼
Verifier ──▶ completeness: every shard, every task, exactly once
  │
  ▼
Reducer ──▶ builtin (concat/json-array/json-object/files/none) or custom command
  │
  ▼
Final result artifact
```

## Glossary

| Term | Meaning |
|---|---|
| **Workload** | The full set of things to process: an index range, a list, or explicit tasks |
| **Task** | One unit of work with a stable string `id` |
| **Shard** | One parallel slice of the workload (a matrix job) |
| **Plan** | The deterministic assignment of every task to a shard |
| **Manifest** | The versioned JSON handed to one shard worker |
| **result-meta.json** | Per-shard metadata: status, timings, completed task ids |
| **Verify** | Proof that coverage is exact before results are trusted |
| **Reduce** | Combining verified shard outputs into one artifact |

## Why deterministic partitioning matters

Retries, deduplication, resumability, and auditing all depend on knowing
*which* shard owns a task without asking anyone. `sha1(taskId) % shardCount`
gives that property with zero coordination. sha1 is used for even
distribution only — not security.

