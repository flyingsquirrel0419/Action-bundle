# Library API

```ts
import {
  createPlan, partition, shardOf,
  createManifest, parseManifest, manifestDigest, canonicalize, runIdFor, MANIFEST_VERSION,
  runWorker, WORKER_ENV, collectFromDir, verifyShards, reduceResults,
  REDUCER_REQUIREMENTS, expectedOutputFor,
  workloadToTasks,
  ActionBundleError, VerificationError, /* ... */
} from "action-bundle";
```

Subpath exports: `action-bundle/planner`, `action-bundle/manifest`.

## Core flow

```ts
// 1. plan
const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: 8 });

// 2. per-shard manifests (setup job)
const manifests = plan.shards.map((s) =>
  createManifest({
    runId: plan.runId,
    shardIndex: s.shardIndex,
    shardCount: plan.shardCount,
    tasks: s.tasks,
  }),
);

// 3. worker (each matrix job); throws WorkerError if the command fails,
//    after writing result-meta.json with status "failed". `cwd` is optional.
await runWorker({ manifest: manifests[0], command: "python3 process.py", outDir: "out", cwd: "workspace" });

// 4. collect + verify (aggregate job); the third argument optionally
//    requires each successful shard to have produced that output.
const collected = await collectFromDir("parts/", plan.shardCount, expectedOutputFor("json-array") ?? undefined);
const report = verifyShards({ manifests, collected, shardCount: plan.shardCount });

// 5. reduce
await reduceResults({ partsDir: "parts/", shardCount: 8, strategy: "json-array", outPath: "result.json" });
```

## Errors

All failures extend `ActionBundleError` with a machine-readable `code`:

`INVALID_CONFIG` · `PLANNING_ERROR` · `PARTITION_ERROR` · `MANIFEST_ERROR` ·
`COLLECTION_ERROR` · `MISSING_SHARDS` · `DUPLICATE_SHARDS` · `MISSING_TASKS` ·
`DUPLICATE_TASKS` · `MALFORMED_RESULT` · `INCOMPATIBLE_VERSION` ·
`UNEXPECTED_SHARD_COUNT` · `RUN_ID_MISMATCH` · `MANIFEST_DIGEST_MISMATCH` ·
`FAILED_SHARD` · `SHARD_ASSIGNMENT_MISMATCH` · `OVERSIZED_INPUT` ·
`REDUCTION_ERROR` · `WORKER_ERROR`

Invalid workloads (unknown `kind`, non-array `items`/`tasks`, empty or
over-4096-character task ids) are rejected at planning time with
`PLANNING_ERROR`, before any shard runs.

```ts
try {
  verifyShards(/* ... */);
} catch (e) {
  if (e instanceof ActionBundleError && e.code === "MISSING_TASKS") {
    console.error(e.details?.missing);
  }
}
```

