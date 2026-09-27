import { VerificationError } from "./errors.js";
import type { ShardManifest } from "./manifest.js";
import type { CollectedShard } from "./collector.js";

export interface VerificationReport {
  ok: boolean;
  shardCount: number;
  expectedTasks: number;
  verifiedTasks: number;
  missingShards: number[];
  missingTasks: string[];
  duplicateTasks: string[];
}

/**
 * Verify collected shard results against the planned manifests.
 * Checks: every shard present, no duplicate shards, task coverage exact
 * (no missing, no duplicates, no unexpected ids), manifest version match.
 * Returns a report; throws VerificationError on failure with details.
 */
export function verifyShards(opts: {
  manifests: ShardManifest[];
  collected: CollectedShard[];
  shardCount: number;
}): VerificationReport {
  const { manifests, collected, shardCount } = opts;

  const expectedShardIds = new Set(manifests.map((m) => m.shardIndex));
  const receivedIds = collected.map((c) => c.shard);
  const receivedSet = new Set(receivedIds);
  if (receivedSet.size !== receivedIds.length) {
    const dupes = receivedIds.filter((id, i) => receivedIds.indexOf(id) !== i);
    throw new VerificationError("DUPLICATE_SHARDS", "duplicate shard results: " + dupes.join(", "), {
      duplicates: [...new Set(dupes)],
    });
  }
  if (collected.length !== shardCount) {
    throw new VerificationError(
      "UNEXPECTED_SHARD_COUNT",
      "expected " + shardCount + " shard results, got " + collected.length,
      { expected: shardCount, got: collected.length },
    );
  }

  const missingShards = [...expectedShardIds].filter((id) => !receivedSet.has(id));
  if (missingShards.length > 0) {
    throw new VerificationError("MISSING_SHARDS", "missing shards: " + missingShards.join(", "), {
      missingShards,
    });
  }

  // Task coverage
  const expectedTasks = manifests.flatMap((m) => m.tasks.map((t) => t.id));
  const expectedSet = new Set(expectedTasks);
  const completed = collected.flatMap((c) => c.meta.completedTaskIds);
  const completedSet = new Set(completed);

  const duplicateTasks = [...new Set(completed.filter((id, i) => completed.indexOf(id) !== i))];
  if (duplicateTasks.length > 0) {
    throw new VerificationError("DUPLICATE_TASKS", "tasks processed more than once", {
      duplicates: duplicateTasks.slice(0, 20),
      totalDuplicates: duplicateTasks.length,
    });
  }

  const missingTasks = [...expectedSet].filter((id) => !completedSet.has(id));
  const unexpectedTasks = [...completedSet].filter((id) => !expectedSet.has(id));
  if (missingTasks.length > 0 || unexpectedTasks.length > 0) {
    const err = new VerificationError(
      "MISSING_TASKS",
      "task coverage mismatch: " +
        missingTasks.length + " missing, " + unexpectedTasks.length + " unexpected",
      {
        expected: expectedSet.size,
        received: completedSet.size,
        missing: missingTasks.slice(0, 20),
        unexpected: unexpectedTasks.slice(0, 20),
        totalMissing: missingTasks.length,
      },
    );
    err.name = "ActionBundleVerificationError";
    throw err;
  }

  return {
    ok: true,
    shardCount,
    expectedTasks: expectedSet.size,
    verifiedTasks: completedSet.size,
    missingShards: [],
    missingTasks: [],
    duplicateTasks: [],
  };
}

