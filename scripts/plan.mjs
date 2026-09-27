import { writeFileSync, mkdirSync } from "node:fs";
import { createPlan } from "../dist/planner.js";
import { createManifest } from "../dist/manifest.js";

// On push triggers, inputs are empty — fall back to the workflow defaults.
const workload = JSON.parse(process.env.WORKLOAD || '{"kind":"index","count":2000}');
const shards =
  process.env.SHARDS === "auto"
    ? "auto"
    : Number(process.env.SHARDS || 8);
const plan = createPlan({ workload, shards });

writeFileSync("plan.json", JSON.stringify(plan, null, 2));
mkdirSync("manifests", { recursive: true });
for (const s of plan.shards) {
  const m = createManifest({
    runId: plan.runId,
    shardIndex: s.shardIndex,
    shardCount: plan.shardCount,
    tasks: s.tasks,
  });
  writeFileSync("manifests/manifest-" + s.shardIndex + ".json", JSON.stringify(m));
}

const matrix = JSON.stringify({ shard: [...Array(plan.shardCount).keys()] });
const out = process.env.GITHUB_OUTPUT;
const append = (k, v) => writeFileSync(out, k + "=" + v + "\n", { flag: "a" });
append("shard_count", plan.shardCount);
append("run_id", plan.runId);
append("matrix", matrix);
console.log("[action-bundle] plan: " + plan.taskCount + " tasks -> " + plan.shardCount + " shards (run " + plan.runId + ")");
