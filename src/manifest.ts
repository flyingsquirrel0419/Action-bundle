import { createHash } from "node:crypto";
import type { Task } from "./task.js";
import { ActionBundleError, ManifestError } from "./errors.js";

export const MANIFEST_VERSION = 2;

/** Execution manifest handed to each shard worker. Versioned schema. */
export interface ShardManifest {
  version: number;
  runId: string;
  shardIndex: number;
  shardCount: number;
  tasks: { id: string; input?: unknown }[];
}

/** Deterministic canonical JSON: recursively sort object keys, keep array order. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
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

/** SHA-256 digest of the canonical manifest bytes — binds a result to its plan. */
export function manifestDigest(manifest: ShardManifest): string {
  return createHash("sha256").update(canonicalize(manifest)).digest("hex");
}

/** Parse and validate a manifest read from disk. Treats input as untrusted. */
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
  if (typeof m.runId !== "string" || m.runId.length === 0 || m.runId.length > 128) {
    throw new ManifestError("manifest runId must be a non-empty string <= 128 chars");
  }
  for (const field of ["shardIndex", "shardCount"] as const) {
    const v = m[field];
    if (typeof v !== "number" || !Number.isInteger(v) || !Number.isFinite(v)) {
      throw new ManifestError("manifest " + field + " must be an integer", { got: v });
    }
  }
  const shardCount = m.shardCount as number;
  const shardIndex = m.shardIndex as number;
  if (shardCount < 1) {
    throw new ManifestError("manifest shardCount must be >= 1", { got: shardCount });
  }
  if (shardIndex < 0 || shardIndex >= shardCount) {
    throw new ManifestError(
      "manifest shardIndex " + shardIndex + " outside 0.." + (shardCount - 1),
    );
  }
  if (!Array.isArray(m.tasks)) {
    throw new ManifestError("manifest tasks is not an array");
  }
  const seen = new Set<string>();
  for (const t of m.tasks) {
    if (typeof t !== "object" || t === null) {
      throw new ManifestError("every manifest task must be an object");
    }
    const id = (t as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0 || id.length > 4096) {
      throw new ManifestError("every manifest task needs a string id (1..4096 chars)");
    }
    if (seen.has(id)) {
      throw new ManifestError("duplicate task id in manifest: " + id);
    }
    seen.add(id);
  }
  return m as unknown as ShardManifest;
}

/**
 * Content-derived run id. Includes canonical task payloads so two workloads
 * with the same ids but different inputs get different identities.
 */
export function runIdFor(tasks: Task[], shardCount: number): string {
  const h = createHash("sha256");
  h.update(String(MANIFEST_VERSION));
  h.update("\0" + String(shardCount));
  for (const t of tasks) {
    h.update("\0" + t.id);
    if (t.input !== undefined) h.update("\0in:" + canonicalize(t.input));
  }
  return "run-" + h.digest("hex").slice(0, 16);
}

