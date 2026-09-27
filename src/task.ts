/** Workload and task identity. */

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
      return Array.from({ length: workload.count }, (_, i) => ({ id: "task-" + i }));
    case "list":
      return workload.items.map((item) => {
        // A list entry's identity is the entry itself, so rerunning the same
        // list reproduces the same shard assignment.
        return { id: item, input: item };
      });
    case "tasks":
      return workload.tasks.map((t) => {
        if (!t.id || typeof t.id !== "string") {
          throw new Error("every task needs a string id");
        }
        return t;
      });
  }
}

