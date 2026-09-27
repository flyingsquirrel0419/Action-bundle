import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createPlan } from "../dist/planner.js";
import { createManifest } from "../dist/manifest.js";
import { runWorker } from "../dist/worker.js";
import { collectFromDir } from "../dist/collector.js";
import { verifyShards } from "../dist/verify.js";
import { reduceResults } from "../dist/reduce.js";

const execFileAsync = promisify(execFile);

test("integration: plan -> workers -> collect -> verify -> reduce", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ab-e2e-"));
  const plan = createPlan({ workload: { kind: "index", count: 200 }, shards: 4 });

  // write manifests (what the setup job would upload)
  const manifestsDir = join(dir, "manifests");
  await mkdir(manifestsDir, { recursive: true });
  const manifests = [];
  for (const s of plan.shards) {
    const m = createManifest({ runId: plan.runId, shardIndex: s.shardIndex, shardCount: plan.shardCount, tasks: s.tasks });
    manifests.push(m);
    await writeFile(join(manifestsDir, "manifest-" + s.shardIndex + ".json"), JSON.stringify(m));
  }

  // run workers (each produces output.json with its task ids)
  const partsDir = join(dir, "parts");
  for (const m of manifests) {
    const outDir = join(partsDir, "shard-" + m.shardIndex);
    await runWorker({
      manifest: m,
      outDir,
      command: "node --input-type=module -e \"import fs from 'node:fs';const m=JSON.parse(fs.readFileSync(process.env.ACTION_BUNDLE_MANIFEST,'utf8'));fs.writeFileSync(process.env.ACTION_BUNDLE_OUTPUT_DIR+'/output.json',JSON.stringify(m.tasks.map(t=>({id:t.id,ok:true}))))\"",
    });
  }

  // collect + verify
  const collected = await collectFromDir(partsDir, plan.shardCount);
  const report = verifyShards({ manifests, collected, shardCount: plan.shardCount });
  assert.ok(report.ok);
  assert.equal(report.verifiedTasks, 200);

  // reduce json-array
  const out = join(dir, "result.json");
  await reduceResults({ partsDir, shardCount: plan.shardCount, strategy: "json-array", outPath: out });
  const merged = JSON.parse(await readFile(out, "utf8"));
  assert.equal(merged.length, 200);
  assert.equal(new Set(merged.map((x) => x.id)).size, 200);
});

test("integration: collect rejects missing shard", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ab-miss-"));
  await mkdir(join(dir, "shard-0"), { recursive: true });
  await writeFile(join(dir, "shard-0", "result-meta.json"), JSON.stringify({
    version: 1, shard: 0, status: "success", taskCount: 1,
    startedAt: "", finishedAt: "", durationMs: 0, completedTaskIds: ["t0"], outputs: [],
  }));
  await assert.rejects(() => collectFromDir(dir, 2), (e) => e.code === "MISSING_SHARDS");
});

test("CLI plan end-to-end", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ab-cli-"));
  const wf = join(dir, "workload.json");
  await writeFile(wf, JSON.stringify({ kind: "index", count: 100 }));
  const { stdout } = await execFileAsync("node", [new URL("../dist/cli.js", import.meta.url).pathname, "plan", wf, "--shards", "4"]);
  assert.match(stdout, /execution plan/);
  assert.match(stdout, /shards       4/);
});
