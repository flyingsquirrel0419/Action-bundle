import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PartFile, ShardResultItem } from "./work.js";

export interface BundleResult {
  itemCount: number;
  shardCount: number;
  totalProcessed: number;
  perShard: { shard: number; processed: number; elapsedSec: number }[];
  slowestShardSec: number;
  items: ShardResultItem[];
}

export class BundleError extends Error {}

/**
 * Merge partial results into one bundle, verifying that:
 * - every shard 0..shardCount-1 contributed exactly one part,
 * - no item was processed twice,
 * - the merged ids exactly cover 0..itemCount-1.
 */
export function bundleParts(
  parts: PartFile[],
  shardCount: number,
  itemCount: number,
): BundleResult {
  const seen = new Set<number>();
  for (const p of parts) seen.add(p.shardIndex);
  const missing: number[] = [];
  for (let i = 0; i < shardCount; i++) if (!seen.has(i)) missing.push(i);
  if (missing.length > 0) {
    throw new BundleError("missing shard parts: " + missing.join(", "));
  }

  const sorted = [...parts].sort((a, b) => a.shardIndex - b.shardIndex);
  const merged = sorted.flatMap((p) => p.items);

  const ids = new Set<number>();
  for (const it of merged) {
    if (ids.has(it.id)) {
      throw new BundleError("item " + it.id + " processed more than once");
    }
    ids.add(it.id);
  }

  for (let id = 0; id < itemCount; id++) {
    if (!ids.has(id)) {
      throw new BundleError("item " + id + " was never processed");
    }
  }
  for (const id of ids) {
    if (id < 0 || id >= itemCount) {
      throw new BundleError(
        "unexpected item id " + id + " outside 0.." + (itemCount - 1),
      );
    }
  }

  const perShard = sorted.map((p) => ({
    shard: p.shardIndex,
    processed: p.processed,
    elapsedSec: p.elapsedSec,
  }));

  return {
    itemCount,
    shardCount,
    totalProcessed: merged.length,
    perShard,
    slowestShardSec: Math.max(...perShard.map((s) => s.elapsedSec)),
    items: merged.sort((a, b) => a.id - b.id),
  };
}

/** Load part-<i>.json files from a directory and bundle them. */
export async function bundleFromDir(opts: {
  partsDir: string;
  shardCount: number;
  itemCount: number;
  outPath?: string;
}): Promise<BundleResult> {
  const parts: PartFile[] = [];
  for (let i = 0; i < opts.shardCount; i++) {
    const raw = await readFile(join(opts.partsDir, "part-" + i + ".json"), "utf8");
    parts.push(JSON.parse(raw) as PartFile);
  }
  const bundle = bundleParts(parts, opts.shardCount, opts.itemCount);
  if (opts.outPath) {
    await writeFile(opts.outPath, JSON.stringify(bundle, null, 2));
  }
  return bundle;
}

