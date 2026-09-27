/** Workload and task identity. */

import { PlanningError } from "./errors.js";

/** Hard ceiling on expanded task count to prevent runner memory exhaustion. */
export const MAX_TASKS = 1_000_000;

/** Hard ceiling on task id length; shared with manifest parsing. */
export const MAX_TASK_ID_LENGTH = 4096;

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
  if (typeof workload !== "object" || workload === null) {
    throw new PlanningError("workload must be a non-null object", { got: workload });
  }
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
    case "list": {
      if (!Array.isArray(workload.items)) {
        throw new PlanningError("workload items must be an array", { got: workload.items });
      }
      if (workload.items.length > MAX_TASKS) {
        throw new PlanningError(
          "workload items exceed the " + MAX_TASKS + " task ceiling",
          { items: workload.items.length, max: MAX_TASKS },
        );
      }
      return workload.items.map((item, i) => {
        if (typeof item !== "string" || item.length === 0 || item.length > MAX_TASK_ID_LENGTH) {
          throw new PlanningError(
            "workload item at index " + i + " must be a string of 1.." + MAX_TASK_ID_LENGTH + " chars",
            { index: i, got: typeof item === "string" ? item.length : item },
          );
        }
        // A list entry's identity is the entry itself, so rerunning the same
        // list reproduces the same shard assignment.
        return { id: item, input: item };
      });
    }
    case "tasks": {
      if (!Array.isArray(workload.tasks)) {
        throw new PlanningError("workload tasks must be an array", { got: workload.tasks });
      }
      if (workload.tasks.length > MAX_TASKS) {
        throw new PlanningError(
          "workload tasks exceed the " + MAX_TASKS + " task ceiling",
          { tasks: workload.tasks.length, max: MAX_TASKS },
        );
      }
      return workload.tasks.map((t, i) => {
        if (typeof t !== "object" || t === null) {
          throw new PlanningError("workload task at index " + i + " must be a non-null object", { index: i });
        }
        if (typeof t.id !== "string" || t.id.length === 0 || t.id.length > MAX_TASK_ID_LENGTH) {
          throw new PlanningError(
            "workload task at index " + i + " needs a string id of 1.." + MAX_TASK_ID_LENGTH + " chars",
            { index: i, got: typeof t.id === "string" ? t.id.length : t.id },
          );
        }
        return t;
      });
    }
    default:
      throw new PlanningError(
        "unknown workload kind: " + String((workload as { kind?: unknown }).kind),
        { kind: (workload as { kind?: unknown }).kind },
      );
  }
}
