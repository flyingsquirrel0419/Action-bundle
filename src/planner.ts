import { workloadToTasks, type Task, type Workload } from "./task.js";
import { partition } from "./partition.js";
import { PlanningError } from "./errors.js";
import { runIdFor } from "./manifest.js";

export interface PlanOptions {
  workload: Workload;
  /** Exact shard count, or "auto" for heuristic selection. */
  shards: number | "auto";
  /** Hard cap for shard count (matrix limit and sanity). Default 32. */
  maxShards?: number;
  /** Minimum tasks per shard for auto planning. Default 1. */
  minTasksPerShard?: number;
}

export interface Plan {
  runId: string;
  shardCount: number;
  taskCount: number;
  /** tasks per shard; index = shard index */
  shards: { shardIndex: number; taskCount: number; tasks: Task[] }[];
}

/**
 * Build an execution plan: expand the workload, pick a shard count, and
 * deterministically partition tasks. Pure and side-effect free.
 */
export function createPlan(opts: PlanOptions): Plan {
  const tasks = workloadToTasks(opts.workload);
  const maxShards = opts.maxShards ?? 32;
  if (maxShards < 1) throw new PlanningError("maxShards must be >= 1");

  let shardCount: number;
  if (opts.shards === "auto") {
    const minPer = opts.minTasksPerShard ?? 1;
    if (minPer < 1) throw new PlanningError("minTasksPerShard must be >= 1");
    if (tasks.length === 0) {
      shardCount = 1;
    } else {
      // Largest shard count that still gives each shard minPer tasks,
      // capped by maxShards and the task count itself.
      shardCount = Math.max(
        1,
        Math.min(maxShards, tasks.length, Math.floor(tasks.length / minPer)),
      );
    }
  } else {
    shardCount = opts.shards;
    if (!Number.isInteger(shardCount) || shardCount < 1) {
      throw new PlanningError("shards must be a positive integer");
    }
    if (shardCount > maxShards) {
      throw new PlanningError(
        "shards " + shardCount + " exceeds maxShards " + maxShards,
        { shards: shardCount, maxShards },
      );
    }
  }

  const buckets = partition(tasks, shardCount);
  return {
    runId: runIdFor(tasks, shardCount),
    shardCount,
    taskCount: tasks.length,
    shards: buckets.map((bucket, i) => ({
      shardIndex: i,
      taskCount: bucket.length,
      tasks: bucket,
    })),
  };
}

