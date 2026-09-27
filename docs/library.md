# Library API

```ts
import {
  createPlan, partition, shardOf,
  createManifest, parseManifest, runIdFor, MANIFEST_VERSION,
  runWorker, collectFromDir, verifyShards, reduceResults,
  workloadToTasks,
  ActionBundleError, VerificationError, /* ... */
} from "action-bundle";
```

Subpath exports: `action-bundle/planner`, `action-bundle/manifest`.

## Core flow

```ts
// 1. plan
const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: 8 });

// 2. per-shard manifest (setup job)
const manifest = createManifest({
  runId: plan.runId,
  shardIndex: 0,
  shardCount: plan.shardCount,
  tasks: plan.shards[0].tasks,
});

// 3. worker (each matrix job)
await runWorker({ manifest, command: "python3 process.py", outDir: "out" });

// 4. collect + verify (aggregate job)
const collected = await collectFromDir("parts/", plan.shardCount);
const report = verifyShards({ manifests, collected, shardCount: plan.shardCount });

// 5. reduce
await reduceResults({ partsDir: "parts/", shardCount: 8, strategy: "json-array", outPath: "result.json" });
```

## Errors

All failures extend `ActionBundleError` with a machine-readable `code`:

`INVALID_CONFIG` · `PLANNING_ERROR` · `PARTITION_ERROR` · `MANIFEST_ERROR` ·
`COLLECTION_ERROR` · `MISSING_SHARDS` · `DUPLICATE_SHARDS` · `MISSING_TASKS` ·
`DUPLICATE_TASKS` · `MALFORMED_RESULT` · `INCOMPATIBLE_VERSION` ·
`UNEXPECTED_SHARD_COUNT` · `REDUCTION_ERROR` · `WORKER_ERROR`

```ts
try {
  verifyShards(/* ... */);
} catch (e) {
  if (e instanceof ActionBundleError && e.code === "MISSING_TASKS") {
    console.error(e.details?.missing);
  }
}
```

