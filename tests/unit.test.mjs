import { test } from "node:test";
import assert from "node:assert/strict";
import { partition, shardOf } from "../dist/partition.js";
import { createPlan } from "../dist/planner.js";
import { createManifest, parseManifest, manifestDigest, runIdFor, canonicalize } from "../dist/manifest.js";
import { verifyShards } from "../dist/verify.js";
import { workloadToTasks, MAX_TASKS } from "../dist/task.js";

// --- partition invariants ---

test("partition: union equals original, buckets disjoint, deterministic", () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => ({ id: "task-" + i }));
  for (const n of [1, 2, 3, 7, 16, 32]) {
    const buckets = partition(tasks, n);
    const union = buckets.flat();
    assert.equal(union.length, tasks.length, "union size for n=" + n);
    const ids = new Set(union.map((t) => t.id));
    assert.equal(ids.size, tasks.length, "no dupes for n=" + n);
    assert.deepEqual(ids, new Set(tasks.map((t) => t.id)), "same set for n=" + n);
    let total = 0;
    for (const b of buckets) total += b.length;
    assert.equal(total, tasks.length);
    const again = partition(tasks, n).map((b) => b.map((t) => t.id));
    assert.deepEqual(buckets.map((b) => b.map((t) => t.id)), again);
  }
});

test("partition: zero tasks", () => {
  assert.deepEqual(partition([], 4), [[], [], [], []]);
});

test("partition: more shards than tasks leaves empty buckets", () => {
  const buckets = partition([{ id: "only" }], 8);
  assert.equal(buckets.flat().length, 1);
});

test("partition: duplicate task id rejected", () => {
  assert.throws(() => partition([{ id: "a" }, { id: "a" }], 2), /duplicate task id/);
});

test("shardOf is stable and within range", () => {
  const s = shardOf("task-42", 16);
  assert.equal(s, shardOf("task-42", 16));
  assert.ok(s >= 0 && s < 16);
});

// --- workloads ---

test("workloadToTasks: index kind", () => {
  const tasks = workloadToTasks({ kind: "index", count: 3 });
  assert.deepEqual(tasks.map((t) => t.id), ["task-0", "task-1", "task-2"]);
});

test("workloadToTasks: list uses item as stable id", () => {
  const tasks = workloadToTasks({ kind: "list", items: ["a.py", "b.py"] });
  assert.deepEqual(tasks.map((t) => t.id), ["a.py", "b.py"]);
});

test("workloadToTasks: rejects oversized/invalid index workload", () => {
  assert.throws(() => workloadToTasks({ kind: "index", count: MAX_TASKS + 1 }));
  assert.throws(() => workloadToTasks({ kind: "index", count: -1 }));
  assert.throws(() => workloadToTasks({ kind: "index", count: Infinity }));
  assert.throws(() => workloadToTasks({ kind: "index", count: 1.5 }));
});

// --- canonicalization + runId ---

test("canonicalize: key order independent", () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
});

test("runId: differs when task payloads differ (same ids)", () => {
  const a = runIdFor([{ id: "A", input: "first" }], 4);
  const b = runIdFor([{ id: "A", input: "different" }], 4);
  assert.notEqual(a, b);
});

test("runId: stable for identical workloads", () => {
  const a = runIdFor([{ id: "A", input: { x: 1 } }], 4);
  const b = runIdFor([{ id: "A", input: { x: 1 } }], 4);
  assert.equal(a, b);
});

// --- planner ---

test("planner: explicit shards", () => {
  const plan = createPlan({ workload: { kind: "index", count: 100 }, shards: 4 });
  assert.equal(plan.shardCount, 4);
  assert.equal(plan.shards.reduce((a, s) => a + s.taskCount, 0), 100);
});

test("planner: shards above maxShards rejected", () => {
  assert.throws(
    () => createPlan({ workload: { kind: "index", count: 10 }, shards: 64, maxShards: 32 }),
    /exceeds maxShards/,
  );
});

// --- manifest validation (untrusted input) ---

test("manifest: round-trip", () => {
  const m = createManifest({ runId: "run-x", shardIndex: 1, shardCount: 4, tasks: [{ id: "t1" }] });
  const parsed = parseManifest(JSON.parse(JSON.stringify(m)));
  assert.equal(parsed.shardIndex, 1);
});

test("manifest: rejects wrong version", () => {
  assert.throws(() => parseManifest({ version: 99 }), /unsupported manifest version/);
});

test("manifest: rejects non-integer/out-of-range shard fields", () => {
  const base = { version: 2, runId: "r", tasks: [] };
  assert.throws(() => parseManifest({ ...base, shardIndex: -1, shardCount: 4 }), /outside/);
  assert.throws(() => parseManifest({ ...base, shardIndex: 1.5, shardCount: 4 }), /integer/);
  assert.throws(() => parseManifest({ ...base, shardIndex: 4, shardCount: 4 }), /outside/);
  assert.throws(() => parseManifest({ ...base, shardIndex: 0, shardCount: 0 }), /shardCount/);
  assert.throws(() => parseManifest({ ...base, shardIndex: 0, shardCount: NaN }), /integer/);
  assert.throws(() => parseManifest({ ...base, shardIndex: 0, shardCount: Infinity }), /integer/);
});

test("manifest: rejects duplicate task ids", () => {
  const m = { version: 2, runId: "r", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }, { id: "a" }] };
  assert.throws(() => parseManifest(m), /duplicate task id/);
});

// --- verify: v2 helpers ---

function manifestFor(shard, shardCount, taskIds, runId = "run-test") {
  return createManifest({
    runId,
    shardIndex: shard,
    shardCount,
    tasks: taskIds.map((id) => ({ id })),
  });
}

function resultFor(manifest, completedTaskIds, over = {}) {
  return {
    shard: manifest.shardIndex,
    meta: {
      version: 2,
      runId: manifest.runId,
      shard: manifest.shardIndex,
      manifestDigest: manifestDigest(manifest),
      status: "success",
      taskCount: manifest.tasks.length,
      startedAt: "", finishedAt: "", durationMs: 0,
      completedTaskIds,
      outputs: [],
      ...over,
    },
  };
}

test("verify: ok when per-shard assignment and coverage are exact", () => {
  const m0 = manifestFor(0, 2, ["a", "b"]);
  const m1 = manifestFor(1, 2, ["c", "d"]);
  const report = verifyShards({
    manifests: [m0, m1],
    collected: [resultFor(m0, ["a", "b"]), resultFor(m1, ["c", "d"])],
    shardCount: 2,
  });
  assert.ok(report.ok);
  assert.equal(report.verifiedTasks, 4);
});

test("verify: rejects swapped shard assignments", () => {
  // shard 0 reports shard 1's tasks and vice versa — globally complete,
  // but each shard reported the wrong assignment.
  const m0 = manifestFor(0, 2, ["a", "b"]);
  const m1 = manifestFor(1, 2, ["c", "d"]);
  assert.throws(
    () => verifyShards({
      manifests: [m0, m1],
      collected: [resultFor(m0, ["c", "d"]), resultFor(m1, ["a", "b"])],
      shardCount: 2,
    }),
    (e) => e.code === "SHARD_ASSIGNMENT_MISMATCH",
  );
});

test("verify: rejects a failed shard even when task ids are complete", () => {
  const m0 = manifestFor(0, 2, ["a", "b"]);
  const m1 = manifestFor(1, 2, ["c", "d"]);
  assert.throws(
    () => verifyShards({
      manifests: [m0, m1],
      collected: [
        resultFor(m0, ["a", "b"], { status: "failed", error: "boom" }),
        resultFor(m1, ["c", "d"]),
      ],
      shardCount: 2,
    }),
    (e) => e.code === "FAILED_SHARD",
  );
});

test("verify: rejects a result from another run", () => {
  const m0 = manifestFor(0, 2, ["a", "b"]);
  const m1 = manifestFor(1, 2, ["c", "d"]);
  assert.throws(
    () => verifyShards({
      manifests: [m0, m1],
      collected: [resultFor(m0, ["a", "b"], { runId: "run-other" }), resultFor(m1, ["c", "d"])],
      shardCount: 2,
    }),
    (e) => e.code === "RUN_ID_MISMATCH",
  );
});

test("verify: rejects a result bound to another manifest (digest mismatch)", () => {
  const m0 = manifestFor(0, 2, ["a", "b"]);
  const m1 = manifestFor(1, 2, ["c", "d"]);
  assert.throws(
    () => verifyShards({
      manifests: [m0, m1],
      collected: [resultFor(m0, ["a", "b"], { manifestDigest: manifestDigest(m1) }), resultFor(m1, ["c", "d"])],
      shardCount: 2,
    }),
    (e) => e.code === "MANIFEST_DIGEST_MISMATCH",
  );
});

test("verify: rejects partial completion (worker reported fewer tasks)", () => {
  const m0 = manifestFor(0, 2, ["a", "b"]);
  const m1 = manifestFor(1, 2, ["c", "d"]);
  assert.throws(
    () => verifyShards({
      manifests: [m0, m1],
      collected: [resultFor(m0, ["a"]), resultFor(m1, ["c", "d"])],
      shardCount: 2,
    }),
    (e) => e.code === "MISSING_TASKS",
  );
});

test("verify: rejects manifests from mixed runs", () => {
  const m0 = manifestFor(0, 2, ["a", "b"], "run-A");
  const m1 = manifestFor(1, 2, ["c", "d"], "run-B");
  assert.throws(
    () => verifyShards({
      manifests: [m0, m1],
      collected: [],
      shardCount: 2,
    }),
    (e) => e.code === "MANIFEST_ERROR",
  );
});

