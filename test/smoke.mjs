import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bundleFromDir,
  bundleParts,
  itemsForShard,
  runShardToFile,
  shardOf,
} from "../dist/index.js";

const SHARDS = 4;
const ITEMS = 100;

// 1. deterministic assignment covers every id exactly once
const assignment = new Map();
for (let id = 0; id < ITEMS; id++) assignment.set(id, shardOf(id, SHARDS));
const union = new Set();
for (let s = 0; s < SHARDS; s++) {
  for (const id of itemsForShard(s, SHARDS, ITEMS)) {
    assert.equal(assignment.get(id), s);
    assert(!union.has(id), "duplicate id " + id);
    union.add(id);
  }
}
assert.equal(union.size, ITEMS);

// 2. end-to-end: shard to files, then bundle from dir
const dir = await mkdtemp(join(tmpdir(), "action-bundle-"));
for (let s = 0; s < SHARDS; s++) {
  await runShardToFile({
    shardIndex: s,
    shardCount: SHARDS,
    itemCount: ITEMS,
    outDir: dir,
  });
}
const bundle = await bundleFromDir({
  partsDir: dir,
  shardCount: SHARDS,
  itemCount: ITEMS,
  outPath: join(dir, "bundle.json"),
});
assert.equal(bundle.totalProcessed, ITEMS);
assert.equal(bundle.shardCount, SHARDS);
assert.equal(new Set(bundle.items.map((i) => i.id)).size, ITEMS);

// 3. bundler rejects a missing shard
const onePart = await runShardToFile({
  shardIndex: 0,
  shardCount: SHARDS,
  itemCount: ITEMS,
  outDir: dir,
});
assert.throws(
  () => bundleParts([onePart.part], SHARDS, ITEMS),
  /missing shard parts/,
);

console.log("smoke tests passed");

