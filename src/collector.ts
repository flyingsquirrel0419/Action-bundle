import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { CollectionError } from "./errors.js";
import type { ShardResultMeta } from "./worker.js";

export interface CollectedShard {
  shard: number;
  meta: ShardResultMeta;
}

/** Strict runtime validation of result-meta.json (untrusted input). */
function validateMeta(meta: unknown): ShardResultMeta {
  if (typeof meta !== "object" || meta === null) {
    throw new CollectionError("MALFORMED_RESULT", "result-meta is not an object");
  }
  const m = meta as Record<string, unknown>;
  if (m.version !== 2) {
    throw new CollectionError(
      "INCOMPATIBLE_VERSION",
      "unsupported result-meta version: " + String(m.version),
      { expected: 2, got: m.version },
    );
  }
  if (typeof m.runId !== "string" || m.runId.length === 0) {
    throw new CollectionError("MALFORMED_RESULT", "result-meta missing runId");
  }
  if (typeof m.manifestDigest !== "string" || !/^[0-9a-f]{64}$/.test(m.manifestDigest)) {
    throw new CollectionError("MALFORMED_RESULT", "result-meta manifestDigest must be a sha256 hex string");
  }
  if (typeof m.shard !== "number" || !Number.isInteger(m.shard) || m.shard < 0) {
    throw new CollectionError("MALFORMED_RESULT", "result-meta shard must be a non-negative integer", { got: m.shard });
  }
  if (m.status !== "success" && m.status !== "failed") {
    throw new CollectionError("MALFORMED_RESULT", "result-meta status must be success|failed", { got: m.status });
  }
  if (typeof m.taskCount !== "number" || !Number.isInteger(m.taskCount) || m.taskCount < 0) {
    throw new CollectionError("MALFORMED_RESULT", "result-meta taskCount must be a non-negative integer");
  }
  if (!Array.isArray(m.completedTaskIds) || !m.completedTaskIds.every((id) => typeof id === "string")) {
    throw new CollectionError("MALFORMED_RESULT", "result-meta completedTaskIds must be a string array");
  }
  const seenIds = new Set<string>();
  for (const id of m.completedTaskIds) {
    if (seenIds.has(id)) {
      throw new CollectionError("DUPLICATE_TASKS", "result-meta completedTaskIds contains a duplicate: " + id);
    }
    seenIds.add(id);
  }
  return m as unknown as ShardResultMeta;
}

/**
 * Collect shard results from a directory of downloaded artifacts.
 * Treats every file as untrusted: strict schema validation, identity bound
 * to the artifact directory, and an optional output-existence cross-check.
 */
export async function collectFromDir(
  dir: string,
  shardCount: number,
  expectedOutput?: string,
): Promise<CollectedShard[]> {
  const results: CollectedShard[] = [];
  const seen = new Set<number>();
  const missing: number[] = [];
  const malformed: string[] = [];
  const missingOutput: number[] = [];

  for (let i = 0; i < shardCount; i++) {
    const path = join(dir, "shard-" + i, "result-meta.json");
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      missing.push(i);
      continue;
    }
    try {
      const meta = validateMeta(JSON.parse(raw));
      // Bind declared identity to the artifact slot it was read from.
      if (meta.shard !== i) {
        throw new CollectionError(
          "MALFORMED_RESULT",
          "result-meta in shard-" + i + "/ declares shard " + meta.shard,
          { directory: i, declared: meta.shard },
        );
      }
      if (seen.has(meta.shard)) {
        throw new CollectionError("DUPLICATE_SHARDS", "duplicate shard result: " + meta.shard, {
          shard: meta.shard,
        });
      }
      seen.add(meta.shard);
      results.push({ shard: meta.shard, meta });

      if (expectedOutput && meta.status === "success") {
        try {
          await access(join(dir, "shard-" + i, expectedOutput));
        } catch {
          missingOutput.push(i);
        }
      }
    } catch (e) {
      if (e instanceof CollectionError) {
        if (e.code === "DUPLICATE_SHARDS") throw e;
        malformed.push("shard-" + i + ": " + e.message);
        continue;
      }
      malformed.push("shard-" + i + ": unparseable");
    }
  }

  if (missing.length > 0) {
    throw new CollectionError("MISSING_SHARDS", "missing shard results: " + missing.join(", "), { missing });
  }
  if (malformed.length > 0) {
    throw new CollectionError("MALFORMED_RESULT", "malformed shard results: " + malformed.join("; "), { malformed });
  }
  if (missingOutput.length > 0) {
    throw new CollectionError(
      "MISSING_SHARDS",
      "shards reported success but did not produce " + expectedOutput + ": " + missingOutput.join(", "),
      { missingOutput, expectedOutput },
    );
  }
  return results.sort((a, b) => a.shard - b.shard);
}

