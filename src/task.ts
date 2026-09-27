/** Workload and task identity. */

import { PlanningError } from "./errors.js";

/** Hard ceiling on expanded task count to prevent runner memory exhaustion. */
export const MAX_TASKS = 1_000_000;

export interface Task {
  /** Stable, unique identity. Used for deterministic assignment, retries, dedup. */
  id: string;
  /** Optional opaque payload passed through to the worker manifest. */
  input?: unknown;
}

export type Workload =
  | { kind: "index"; count: number }
  | { kind: "list"; items: string[] }
  | { kind: "tasks"; tasks: Task[] };

/** Expand a workload into concrete tasks with stable ids. */
export function workloadToTasks(workload: Workload): Task[] {
  switch (workload.kind) {
    case "index":
      if (
        !Number.isFinite(workload.count) ||
        !Number.isInteger(workload.count) ||
        workload.count < 0 ||
        workload.count > MAX_TASKS
      ) {
        throw new PlanningError(
          "workload count must be an integer in 0.." + MAX_TASKS,
          { count: workload.count, max: MAX_TASKS },
        );
      }
      return Array.from({ length: workload.count }, (_, i) => ({ id: "task-" + i }));
    case "list":
      if (workload.items.length > MAX_TASKS) {
        throw new PlanningError(
          "workload items exceed the " + MAX_TASKS + " task ceiling",
          { items: workload.items.length, max: MAX_TASKS },
        );
      }
      return workload.items.map((item) => {
        // A list entry's identity is the entry itself, so rerunning the same
        // list reproduces the same shard assignment.
        return { id: item, input: item };
      });
    case "tasks":
      if (workload.tasks.length > MAX_TASKS) {
        throw new PlanningError(
          "workload tasks exceed the " + MAX_TASKS + " task ceiling",
          { tasks: workload.tasks.length, max: MAX_TASKS },
        );
      }
      return workload.tasks.map((t) => {
        if (!t.id || typeof t.id !== "string") {
          throw new Error("every task needs a string id");
        }
        return t;
      });
  }
}
