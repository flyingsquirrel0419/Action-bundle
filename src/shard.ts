import { createHash } from "node:crypto";

/**
 * Deterministic shard assignment: an item belongs to shard
 * sha1("item-<id>") % shardCount. Same input always lands on the same
 * shard, so partial results from parallel workers can be merged safely.
 */
export function itemBelongsToShard(
  itemId: number,
  shardIndex: number,
  shardCount: number,
): boolean {
  return shardOf(itemId, shardCount) === shardIndex;
}

/** Which shard an item is assigned to. */
export function shardOf(itemId: number, shardCount: number): number {
  const digest = createHash("sha1").update("item-" + itemId).digest();
  // First 4 bytes as uint32 — plenty for realistic shard counts.
  return digest.readUInt32BE(0) % shardCount;
}

/** All item ids in [0, itemCount) assigned to the given shard. */
export function itemsForShard(
  shardIndex: number,
  shardCount: number,
  itemCount: number,
): number[] {
  const out: number[] = [];
  for (let id = 0; id < itemCount; id++) {
    if (itemBelongsToShard(id, shardIndex, shardCount)) out.push(id);
  }
  return out;
}

