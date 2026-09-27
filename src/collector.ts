import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { CollectionError } from "./errors.js";
import type { ShardResultMeta } from "./worker.js";

export interface CollectedShard {
  shard: number;
  meta: ShardResultMeta;
}

/**
 * Collect shard results from a directory of downloaded artifacts.
 * Expects result-meta.json for each shard in 0..shardCount-1.
 * Performs structural validation but not full task-coverage verification
 * (that is the verifier's job).
 *
 * When expectedOutput is given ("output.json" | "output.txt"), each shard's
 * claimed success is cross-checked against the file actually existing on
 * disk, so a worker that exits 0 without producing output cannot pass.
 */
export async function collectFromDir(
  dir: string,
  shardCount: number,
  expectedOutput?: string,
): Promise<CollectedShard[]> {
  const results: CollectedShard[] = [];
  const seen = new Set<number>();
  const missing: number[] = [];
  const malformed: number[] = [];
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
      const meta = JSON.parse(raw) as ShardResultMeta;
      if (
        typeof meta.shard !== "number" ||
        meta.version !== 1 ||
        typeof meta.taskCount !== "number" ||
        !Array.isArray(meta.completedTaskIds) ||
        !meta.completedTaskIds.every((id) => typeof id === "string")
      ) {
        malformed.push(i);
        continue;
      }
      // Bind declared identity to the artifact slot it was read from.
      if (meta.shard !== i) {
        malformed.push(i);
        continue;
      }
      if (seen.has(meta.shard)) {
        throw new CollectionError("DUPLICATE_SHARDS", "duplicate shard result: " + meta.shard, {
          shard: meta.shard,
        });
      }
      seen.add(meta.shard);
      results.push({ shard: meta.shard, meta });

      // Cross-check claimed success against on-disk output.
      if (expectedOutput && meta.status === "success") {
        try {
          await access(join(dir, "shard-" + i, expectedOutput));
        } catch {
          missingOutput.push(i);
        }
      }
    } catch (e) {
      if (e instanceof CollectionError) throw e;
      malformed.push(i);
    }
  }

  if (missing.length > 0) {
    throw new CollectionError("MISSING_SHARDS", "missing shard results: " + missing.join(", "), {
      missing,
    });
  }
  if (malformed.length > 0) {
    throw new CollectionError("MALFORMED_RESULT", "malformed shard results: " + malformed.join(", "), {
      malformed,
    });
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
