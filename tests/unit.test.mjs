import { test } from "node:test";
import assert from "node:assert/strict";
import { partition, shardOf } from "../dist/partition.js";
import { createPlan } from "../dist/planner.js";
import { createManifest, parseManifest, MANIFEST_VERSION } from "../dist/manifest.js";
import { verifyShards } from "../dist/verify.js";
import { workloadToTasks } from "../dist/task.js";

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
    // disjoint
    let total = 0;
    for (const b of buckets) total += b.length;
    assert.equal(total, tasks.length);
    // deterministic
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
  assert.throws(
    () => partition([{ id: "a" }, { id: "a" }], 2),
    /duplicate task id/,
  );
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

// --- planner ---

test("planner: explicit shards", () => {
  const plan = createPlan({ workload: { kind: "index", count: 100 }, shards: 4 });
  assert.equal(plan.shardCount, 4);
  assert.equal(plan.taskCount, 100);
  assert.equal(plan.shards.reduce((a, s) => a + s.taskCount, 0), 100);
});

test("planner: auto picks a sane shard count", () => {
  const plan = createPlan({ workload: { kind: "index", count: 1000 }, shards: "auto", minTasksPerShard: 10 });
  assert.ok(plan.shardCount >= 1 && plan.shardCount <= 32);
  assert.ok(plan.taskCount / plan.shardCount >= 10 - 1);
});

test("planner: shards above maxShards rejected", () => {
  assert.throws(
    () => createPlan({ workload: { kind: "index", count: 10 }, shards: 64, maxShards: 32 }),
    /exceeds maxShards/,
  );
});

test("planner: runId is stable for identical workloads", () => {
  const a = createPlan({ workload: { kind: "index", count: 50 }, shards: 4 });
  const b = createPlan({ workload: { kind: "index", count: 50 }, shards: 4 });
  assert.equal(a.runId, b.runId);
});

// --- manifest ---

test("manifest: round-trip and version guard", () => {
  const m = createManifest({ runId: "run-x", shardIndex: 1, shardCount: 4, tasks: [{ id: "t1" }] });
  const parsed = parseManifest(JSON.parse(JSON.stringify(m)));
  assert.equal(parsed.version, MANIFEST_VERSION);
  assert.throws(() => parseManifest({ version: 99 }), /unsupported manifest version/);
  assert.throws(() => parseManifest("nope"), /not an object/);
});

// --- verify failure modes ---

function fakeCollected(shard, taskIds) {
  return {
    shard,
    meta: {
      version: 1, shard, status: "success", taskCount: taskIds.length,
      startedAt: "", finishedAt: "", durationMs: 0,
      completedTaskIds: taskIds, outputs: [],
    },
  };
}

test("verify: ok when coverage is exact", () => {
  const manifests = [0, 1].map((i) =>
    createManifest({ runId: "r", shardIndex: i, shardCount: 2, tasks: [{ id: "t" + i }] }));
  const collected = [fakeCollected(0, ["t0"]), fakeCollected(1, ["t1"])];
  const report = verifyShards({ manifests, collected, shardCount: 2 });
  assert.ok(report.ok);
});

test("verify: missing tasks reported with actionable details", () => {
  const manifests = [0, 1].map((i) =>
    createManifest({ runId: "r", shardIndex: i, shardCount: 2, tasks: [{ id: "t" + i }] }));
  const collected = [fakeCollected(0, ["t0"]), fakeCollected(1, [])];
  try {
    verifyShards({ manifests, collected, shardCount: 2 });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.code, "MISSING_TASKS");
    assert.ok(e.details.missing.includes("t1"));
  }
});

test("verify: duplicate tasks detected", () => {
  const manifests = [0, 1].map((i) =>
    createManifest({ runId: "r", shardIndex: i, shardCount: 2, tasks: [{ id: "t" + i }] }));
  const collected = [fakeCollected(0, ["t0"]), fakeCollected(1, ["t1", "t0"])];
  assert.throws(() => verifyShards({ manifests, collected, shardCount: 2 }), (e) => e.code === "DUPLICATE_TASKS");
});

test("verify: unexpected shard count", () => {
  const manifests = [0].map((i) =>
    createManifest({ runId: "r", shardIndex: i, shardCount: 1, tasks: [{ id: "t" + i }] }));
  assert.throws(
    () => verifyShards({ manifests, collected: [], shardCount: 2 }),
    (e) => e.code === "UNEXPECTED_SHARD_COUNT",
  );
});

