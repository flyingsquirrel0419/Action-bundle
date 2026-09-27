import { createHash } from "node:crypto";
import type { Task } from "./task.js";
import { ActionBundleError, ManifestError } from "./errors.js";

export const MANIFEST_VERSION = 1;

/** Execution manifest handed to each shard worker. Versioned schema. */
export interface ShardManifest {
  version: number;
  runId: string;
  shardIndex: number;
  shardCount: number;
  tasks: { id: string; input?: unknown }[];
}

export function createManifest(opts: {
  runId: string;
  shardIndex: number;
  shardCount: number;
  tasks: Task[];
}): ShardManifest {
  if (opts.shardIndex < 0 || opts.shardIndex >= opts.shardCount) {
    throw new ManifestError(
      "shardIndex " + opts.shardIndex + " outside 0.." + (opts.shardCount - 1),
    );
  }
  return {
    version: MANIFEST_VERSION,
    runId: opts.runId,
    shardIndex: opts.shardIndex,
    shardCount: opts.shardCount,
    tasks: opts.tasks.map((t) =>
      t.input === undefined ? { id: t.id } : { id: t.id, input: t.input },
    ),
  };
}

/** Parse and validate a manifest read from disk. */
export function parseManifest(raw: unknown): ShardManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new ManifestError("manifest is not an object");
  }
  const m = raw as Record<string, unknown>;
  if (m.version !== MANIFEST_VERSION) {
    throw new ActionBundleError(
      "INCOMPATIBLE_VERSION",
      "unsupported manifest version: " + String(m.version),
      { expected: MANIFEST_VERSION, got: m.version },
    );
  }
  if (
    typeof m.runId !== "string" ||
    typeof m.shardIndex !== "number" ||
    typeof m.shardCount !== "number"
  ) {
    throw new ManifestError("manifest missing runId/shardIndex/shardCount");
  }
  if (!Array.isArray(m.tasks)) {
    throw new ManifestError("manifest tasks is not an array");
  }
  for (const t of m.tasks) {
    if (typeof t !== "object" || t === null || typeof (t as { id?: unknown }).id !== "string") {
      throw new ManifestError("every manifest task needs a string id");
    }
  }
  return m as unknown as ShardManifest;
}

/** Content-derived run id, stable for identical workloads. */
export function runIdFor(tasks: Task[], shardCount: number): string {
  const h = createHash("sha1");
  h.update(String(shardCount));
  for (const t of tasks) h.update("\0" + t.id);
  return "run-" + h.digest("hex").slice(0, 12);
}

