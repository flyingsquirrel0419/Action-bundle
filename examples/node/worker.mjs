// Node.js worker example for Action-bundle.
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(process.env.ACTION_BUNDLE_MANIFEST, "utf8"));
const rows = manifest.tasks.map((t) => ({ id: t.id, length: t.id.length }));
fs.writeFileSync(
  process.env.ACTION_BUNDLE_OUTPUT_DIR + "/output.json",
  JSON.stringify(rows),
);
if (process.env.ACTION_BUNDLE_COMPLETIONS) {
  fs.writeFileSync(
    process.env.ACTION_BUNDLE_COMPLETIONS,
    JSON.stringify({ completedTaskIds: manifest.tasks.map((t) => t.id) }),
  );
}
console.log("[node-worker] shard " + manifest.shardIndex + ": " + rows.length + " tasks");
