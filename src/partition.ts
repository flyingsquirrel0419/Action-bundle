import { createHash } from "node:crypto";
import type { Task } from "./task.js";
import { ActionBundleError } from "./errors.js";

/**
 * Deterministic shard assignment: shardOf(id) = sha1(id)[0..3] % shardCount.
 * The same task id always lands on the same shard, so partial results from
 * parallel workers can be verified and merged safely, and reruns reproduce
 * identical assignments. sha1 is used only for even distribution, not security.
 */
export function shardOf(taskId: string, shardCount: number): number {
  if (shardCount < 1) {
    throw new ActionBundleError("PARTITION_ERROR", "shardCount must be >= 1");
  }
  const digest = createHash("sha1").update(taskId).digest();
  return digest.readUInt32BE(0) % shardCount;
}

/**
 * Partition tasks into shardCount buckets, preserving input order within
 * each bucket. Every task appears in exactly one bucket.
 */
export function partition(tasks: Task[], shardCount: number): Task[][] {
  if (shardCount < 1) {
    throw new ActionBundleError("PARTITION_ERROR", "shardCount must be >= 1");
  }
  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.id)) {
      throw new ActionBundleError("PARTITION_ERROR", "duplicate task id: " + t.id, {
        taskId: t.id,
      });
    }
    seen.add(t.id);
  }
  const buckets: Task[][] = Array.from({ length: shardCount }, () => []);
  for (const t of tasks) {
    buckets[shardOf(t.id, shardCount)].push(t);
  }
  return buckets;
}

