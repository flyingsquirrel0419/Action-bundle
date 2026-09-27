// Benchmark worker: hash-based CPU load, writes output.json for the shard.
// Used by the reusable workflow as the demo workload.
import fs from "node:fs";
import { digestRounds } from "../../dist/worker.js";

const manifest = JSON.parse(fs.readFileSync(process.env.ACTION_BUNDLE_MANIFEST, "utf8"));
const intensity = Number(process.env.INTENSITY || 200);
const rows = manifest.tasks.map((t) => ({
  id: t.id,
  digest: digestRounds(t.id, intensity),
}));
fs.writeFileSync(
  process.env.ACTION_BUNDLE_OUTPUT_DIR + "/output.json",
  JSON.stringify(rows),
);
console.log("[benchmark] shard " + manifest.shardIndex + ": " + rows.length + " tasks at intensity " + intensity);

