import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createPlan } from "../dist/planner.js";
import { createManifest, manifestDigest } from "../dist/manifest.js";
import { runWorker } from "../dist/worker.js";
import { collectFromDir } from "../dist/collector.js";
import { verifyShards } from "../dist/verify.js";
import { reduceResults } from "../dist/reduce.js";

const execFileAsync = promisify(execFile);
const CLI = new URL("../dist/cli.js", import.meta.url).pathname;

async function tmpDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

// Worker command that processes every task and reports completions.
const GOOD_WORKER =
  'node --input-type=module -e "import fs from \'node:fs\';' +
  'const m=JSON.parse(fs.readFileSync(process.env.ACTION_BUNDLE_MANIFEST,\'utf8\'));' +
  'fs.writeFileSync(process.env.ACTION_BUNDLE_OUTPUT_DIR+\'/output.json\',JSON.stringify(m.tasks.map(t=>({id:t.id}))));' +
  'fs.writeFileSync(process.env.ACTION_BUNDLE_COMPLETIONS,JSON.stringify({completedTaskIds:m.tasks.map(t=>t.id)}));"';

test("integration: plan -> workers -> collect -> verify -> reduce", async () => {
  const dir = await tmpDir("ab-e2e-");
  const plan = createPlan({ workload: { kind: "index", count: 200 }, shards: 4 });

  const manifestsDir = join(dir, "manifests");
  await mkdir(manifestsDir, { recursive: true });
  const manifests = [];
  for (const s of plan.shards) {
    const m = createManifest({ runId: plan.runId, shardIndex: s.shardIndex, shardCount: plan.shardCount, tasks: s.tasks });
    manifests.push(m);
    await writeFile(join(manifestsDir, "manifest-" + s.shardIndex + ".json"), JSON.stringify(m));
  }

  const partsDir = join(dir, "parts");
  for (const m of manifests) {
    await runWorker({ manifest: m, outDir: join(partsDir, "shard-" + m.shardIndex), command: GOOD_WORKER });
  }

  const collected = await collectFromDir(partsDir, plan.shardCount, "output.json");
  const report = verifyShards({ manifests, collected, shardCount: plan.shardCount });
  assert.ok(report.ok);
  assert.equal(report.verifiedTasks, 200);

  const out = join(dir, "result.json");
  await reduceResults({ partsDir, shardCount: plan.shardCount, strategy: "json-array", outPath: out });
  const merged = JSON.parse(await readFile(out, "utf8"));
  assert.equal(merged.length, 200);
  assert.equal(new Set(merged.map((x) => x.id)).size, 200);
});

test("integration: worker exiting 0 without completions completes nothing", async () => {
  const dir = await tmpDir("ab-noop-");
  const m = createManifest({ runId: "run-x", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }, { id: "b" }] });
  // Worker writes valid-looking output but no completions file.
  const meta = await runWorker({
    manifest: m,
    outDir: join(dir, "shard-0"),
    command: "node -e \"require('fs').writeFileSync(process.env.ACTION_BUNDLE_OUTPUT_DIR+'/output.json','[]')\"",
  });
  assert.equal(meta.completedTaskIds.length, 0, "no completions file -> nothing completed");
  const collected = await collectFromDir(dir, 1, "output.json");
  assert.throws(
    () => verifyShards({ manifests: [m], collected, shardCount: 1 }),
    (e) => e.code === "MISSING_TASKS",
  );
});

test("integration: collect rejects mixed-run artifacts", async () => {
  const dir = await tmpDir("ab-mixed-");
  // Two runs with identical plans but different runIds.
  const plan = { shardCount: 2, tasks: [["a"], ["b"]] };
  const mA0 = createManifest({ runId: "run-A", shardIndex: 0, shardCount: 2, tasks: [{ id: "a" }] });
  const mA1 = createManifest({ runId: "run-A", shardIndex: 1, shardCount: 2, tasks: [{ id: "b" }] });
  const mB1 = createManifest({ runId: "run-B", shardIndex: 1, shardCount: 2, tasks: [{ id: "b" }] });
  // shard-0 from run A, shard-1 from run B — same task content, different run.
  // Write completions so only the runId differs (isolate the identity check).
  const writeResult = async (manifest, name, ids) => {
    const out = join(dir, name);
    await mkdir(out, { recursive: true });
    const meta = {
      version: 2, runId: manifest.runId, shard: manifest.shardIndex,
      manifestDigest: manifestDigest(manifest), status: "success",
      taskCount: manifest.tasks.length, startedAt: "", finishedAt: "",
      durationMs: 0, completedTaskIds: ids, outputs: [],
    };
    await writeFile(join(out, "result-meta.json"), JSON.stringify(meta));
  };
  await writeResult(mA0, "shard-0", ["a"]);
  await writeResult(mB1, "shard-1", ["b"]);
  const collected = await collectFromDir(dir, 2);
  assert.throws(
    () => verifyShards({ manifests: [mA0, mA1], collected, shardCount: 2 }),
    (e) => e.code === "RUN_ID_MISMATCH",
  );
});

test("integration: collect rejects a result-meta declaring the wrong shard", async () => {
  const dir = await tmpDir("ab-bind-");
  await mkdir(join(dir, "shard-0"), { recursive: true });
  await writeFile(join(dir, "shard-0", "result-meta.json"), JSON.stringify({
    version: 2, runId: "run-x", shard: 1, manifestDigest: "0".repeat(64),
    status: "success", taskCount: 0, startedAt: "", finishedAt: "",
    durationMs: 0, completedTaskIds: [], outputs: [],
  }));
  await assert.rejects(() => collectFromDir(dir, 1), (e) => e.code === "MALFORMED_RESULT");
});

test("integration: collect rejects malformed result-meta fields", async () => {
  const dir = await tmpDir("ab-badmeta-");
  await mkdir(join(dir, "shard-0"), { recursive: true });
  const base = {
    version: 2, runId: "run-x", shard: 0, manifestDigest: "0".repeat(64),
    status: "success", taskCount: 0, startedAt: "", finishedAt: "",
    durationMs: 0, completedTaskIds: [], outputs: [],
  };
  for (const bad of [
    { status: "ok" },
    { shard: -1 },
    { shard: 1.5 },
    { taskCount: -3 },
    { completedTaskIds: ["a", "a"] },
    { version: 1 },
  ]) {
    await writeFile(join(dir, "shard-0", "result-meta.json"), JSON.stringify({ ...base, ...bad }));
    await assert.rejects(() => collectFromDir(dir, 1), (e) => e.code === "MALFORMED_RESULT" || e.code === "INCOMPATIBLE_VERSION" || e.code === "DUPLICATE_TASKS");
  }
});

test("reduce json-object: duplicate keys across shards rejected", async () => {
  const dir = await tmpDir("ab-dupk-");
  for (const i of [0, 1]) {
    await mkdir(join(dir, "shard-" + i), { recursive: true });
    await writeFile(join(dir, "shard-" + i, "output.json"), JSON.stringify({ shared: i }));
  }
  await assert.rejects(
    () => reduceResults({ partsDir: dir, shardCount: 2, strategy: "json-object", outPath: join(dir, "out.json") }),
    (e) => e.code === "REDUCTION_ERROR" && /duplicate key/.test(e.message),
  );
});

test("reduce json-object: forbidden keys rejected", async () => {
  const dir = await tmpDir("ab-proto-");
  await mkdir(join(dir, "shard-0"), { recursive: true });
  await writeFile(join(dir, "shard-0", "output.json"), '{"__proto__": {"x": 1}}');
  await assert.rejects(
    () => reduceResults({ partsDir: dir, shardCount: 1, strategy: "json-object", outPath: join(dir, "out.json") }),
    (e) => e.code === "REDUCTION_ERROR" && /forbidden key/.test(e.message),
  );
});

test("reduce: unknown strategy rejected explicitly", async () => {
  const dir = await tmpDir("ab-unk-");
  await assert.rejects(
    () => reduceResults({ partsDir: dir, shardCount: 1, strategy: "bogus", outPath: join(dir, "out.json") }),
    (e) => e.code === "REDUCTION_ERROR" && /unknown reduce strategy/.test(e.message),
  );
});

test("CLI plan end-to-end", async () => {
  const dir = await tmpDir("ab-cli-");
  const wf = join(dir, "workload.json");
  await writeFile(wf, JSON.stringify({ kind: "index", count: 100 }));
  const { stdout } = await execFileAsync("node", [CLI, "plan", wf, "--shards", "4"]);
  assert.match(stdout, /execution plan/);
  assert.match(stdout, /shards       4/);
});

test("reduce: oversized shard output rejected before reading", async () => {
  const dir = await tmpDir("ab-big-");
  await mkdir(join(dir, "shard-0"), { recursive: true });
  const big = "x".repeat(64 * 1024 * 1024 + 1);
  await writeFile(join(dir, "shard-0", "output.txt"), big);
  await assert.rejects(
    () => reduceResults({ partsDir: dir, shardCount: 1, strategy: "concat", outPath: join(dir, "out.txt") }),
    (e) => e.code === "REDUCTION_ERROR" && /exceeds/.test(e.message),
  );
});

test("reduce: custom command exiting 0 without creating output is rejected", async () => {
  const dir = await tmpDir("ab-nored-");
  await assert.rejects(
    () => reduceResults({
      partsDir: dir, shardCount: 1,
      command: "true",
      outPath: join(dir, "missing.json"),
    }),
    (e) => e.code === "REDUCTION_ERROR" && /did not create/.test(e.message),
  );
});
