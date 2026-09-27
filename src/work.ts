import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { itemsForShard } from "./shard.js";

export interface ShardResultItem {
  id: number;
  digest: string;
  shard: number;
}

export interface PartFile {
  shardIndex: number;
  shardCount: number;
  processed: number;
  elapsedSec: number;
  items: ShardResultItem[];
}

/** Default demo work: repeated hashing to burn a little CPU. */
export function defaultProcessItem(itemId: number): string {
  let digest = createHash("sha256").update("item-" + itemId).digest("hex");
  for (let i = 0; i < 200; i++) {
    digest = createHash("sha256").update(digest).digest("hex");
  }
  return digest.slice(0, 16);
}

export interface WorkOptions {
  shardIndex: number;
  shardCount: number;
  itemCount: number;
  /** Custom per-item processor; must return a digest string. */
  processItem?: (itemId: number) => string;
}

/** Run this shard's share of the work and return the in-memory part. */
export function runShard(opts: WorkOptions): PartFile {
  const { shardIndex, shardCount, itemCount } = opts;
  if (shardIndex < 0 || shardIndex >= shardCount) {
    throw new RangeError(
      "shardIndex must be in 0.." + (shardCount - 1) + ", got " + shardIndex,
    );
  }
  const processItem = opts.processItem ?? defaultProcessItem;
  const started = performance.now();
  const items: ShardResultItem[] = itemsForShard(
    shardIndex,
    shardCount,
    itemCount,
  ).map((id) => ({ id, digest: processItem(id), shard: shardIndex }));

  return {
    shardIndex,
    shardCount,
    processed: items.length,
    elapsedSec: Math.round(performance.now() - started) / 1000,
    items,
  };
}

/** Run the shard and write part-<index>.json into outDir. */
export async function runShardToFile(
  opts: WorkOptions & { outDir: string },
): Promise<{ path: string; part: PartFile }> {
  const part = runShard(opts);
  await mkdir(opts.outDir, { recursive: true });
  const path = join(opts.outDir, "part-" + part.shardIndex + ".json");
  await writeFile(path, JSON.stringify(part, null, 2));
  return { path, part };
}

