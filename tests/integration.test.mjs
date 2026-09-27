import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createPlan } from "../dist/planner.js";
import { createManifest, manifestDigest } from "../dist/manifest.js";
import { runWorker } from "../dist/worker.js";
import { collectFromDir } from "../dist/collector.js";
import { verifyShards } from "../dist/verify.js";
import { reduceResults } from "../dist/reduce.js";
import { runShell } from "../dist/exec.js";

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

test("collector: typed expected output requires the right kind", async () => {
  const dir = await tmpDir("ab-expout-");
  const meta = {
    version: 2, runId: "run-x", shard: 0, manifestDigest: "0".repeat(64),
    status: "success", taskCount: 0, startedAt: "", finishedAt: "",
    durationMs: 0, completedTaskIds: [], outputs: [],
  };
  await mkdir(join(dir, "shard-0"), { recursive: true });
  await writeFile(join(dir, "shard-0", "result-meta.json"), JSON.stringify(meta));
  const req = { type: "directory", name: "files" };
  // A regular file named "files" must not satisfy a directory requirement.
  await writeFile(join(dir, "shard-0", "files"), "not a dir");
  await assert.rejects(
    () => collectFromDir(dir, 1, req),
    (e) => e.code === "MISSING_SHARDS" && /files is not a directory/.test(e.message),
  );
  // A real directory satisfies it.
  await rm(join(dir, "shard-0", "files"));
  await mkdir(join(dir, "shard-0", "files"));
  const collected = await collectFromDir(dir, 1, req);
  assert.equal(collected.length, 1);
});

test("CLI verify --expect-output files rejects a regular file with exit 3", async () => {
  const dir = await tmpDir("ab-cliver-");
  await mkdir(join(dir, "manifests"), { recursive: true });
  const m = createManifest({ runId: "run-v", shardIndex: 0, shardCount: 1, tasks: [] });
  await writeFile(join(dir, "manifests", "manifest-0.json"), JSON.stringify(m));
  await mkdir(join(dir, "parts", "shard-0"), { recursive: true });
  await writeFile(join(dir, "parts", "shard-0", "result-meta.json"), JSON.stringify({
    version: 2, runId: "run-v", shard: 0, manifestDigest: manifestDigest(m),
    status: "success", taskCount: 0, startedAt: "", finishedAt: "",
    durationMs: 0, completedTaskIds: [], outputs: [],
  }));
  // "files" exists but is a regular file — verification must fail (exit 3).
  await writeFile(join(dir, "parts", "shard-0", "files"), "not a dir");
  await assert.rejects(
    execFileAsync("node", [CLI, "verify", "--parts-dir", join(dir, "parts"), "--shard-count", "1",
      "--manifests-dir", join(dir, "manifests"), "--expect-output", "files"]),
    (e) => e.code === 3,
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

test("reduce files: requires a real directory per shard", async () => {
  // Missing files/ directory.
  const missing = await tmpDir("ab-files-missing-");
  await mkdir(join(missing, "shard-0"), { recursive: true });
  await assert.rejects(
    () => reduceResults({ partsDir: missing, shardCount: 1, strategy: "files", outPath: join(missing, "out.json") }),
    (e) => e.code === "REDUCTION_ERROR" && /missing expected output files/.test(e.message),
  );
  // A regular file named "files" is not a directory.
  const notdir = await tmpDir("ab-files-notdir-");
  await mkdir(join(notdir, "shard-0"), { recursive: true });
  await writeFile(join(notdir, "shard-0", "files"), "not a dir");
  await assert.rejects(
    () => reduceResults({ partsDir: notdir, shardCount: 1, strategy: "files", outPath: join(notdir, "out.json") }),
    (e) => e.code === "REDUCTION_ERROR" && /is not a directory/.test(e.message),
  );
  // An existing empty directory is valid and yields an empty listing.
  const empty = await tmpDir("ab-files-empty-");
  await mkdir(join(empty, "shard-0", "files"), { recursive: true });
  const res = await reduceResults({ partsDir: empty, shardCount: 1, strategy: "files", outPath: join(empty, "out.json") });
  assert.deepEqual(JSON.parse(await readFile(res.outPath, "utf8")), { "shard-0": [] });
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

test("CLI plan rejects non-integer numeric flags with exit 2", async () => {
  const dir = await tmpDir("ab-clibad-");
  const wf = join(dir, "workload.json");
  await writeFile(wf, JSON.stringify({ kind: "index", count: 100 }));
  for (const flag of ["--max-shards", "--min-tasks-per-shard", "--shards"]) {
    await assert.rejects(
      execFileAsync("node", [CLI, "plan", wf, flag, "abc"]),
      (e) => e.code === 2,
    );
  }
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

test("reduce: custom reducer must not accept a stale output file", async () => {
  const dir = await tmpDir("ab-staleout-");
  const outPath = join(dir, "out.json");
  await writeFile(outPath, '{"stale":true}');
  await assert.rejects(
    () => reduceResults({
      partsDir: dir, shardCount: 1,
      command: "true",
      outPath,
    }),
    (e) => e.code === "REDUCTION_ERROR" && /did not create/.test(e.message),
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

test("worker: stale completions.json from a previous run is not evidence", async () => {
  const dir = await tmpDir("ab-stale-");
  const m = createManifest({ runId: "run-s", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }, { id: "b" }] });
  const outDir = join(dir, "shard-0");
  const first = await runWorker({ manifest: m, outDir, command: GOOD_WORKER });
  assert.equal(first.completedTaskIds.length, 2, "first run reports all tasks");
  // Rerun the same manifest into the same outDir with a no-op command:
  // the stale completions file must be cleared, not trusted.
  const second = await runWorker({ manifest: m, outDir, command: "true" });
  assert.equal(second.completedTaskIds.length, 0, "stale completions must not count");
  assert.equal(second.status, "success");
});

test("worker: command exceeding timeoutMs is marked failed with a timeout message", async () => {
  const dir = await tmpDir("ab-wtime-");
  const m = createManifest({ runId: "run-t", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }] });
  const outDir = join(dir, "shard-0");
  const started = Date.now();
  await assert.rejects(
    () => runWorker({ manifest: m, outDir, command: "sleep 5", timeoutMs: 200 }),
    (e) => e.code === "WORKER_ERROR" && /timed out/.test(e.details?.error ?? ""),
  );
  assert.ok(Date.now() - started < 4000, "timeout fires well before the command finishes");
  const meta = JSON.parse(await readFile(join(outDir, "result-meta.json"), "utf8"));
  assert.equal(meta.status, "failed");
  assert.match(meta.error, /timed out/);
});

test("worker: timeout kills the whole process group, no orphans survive", async () => {
  const dir = await tmpDir("ab-wgroup-");
  const pidFile = join(dir, "pids");
  const m = createManifest({ runId: "run-g", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }] });
  // sh records its own pid and a background child's pid, then waits on it.
  // A timeout must terminate both — killing only sh would orphan the sleep.
  const command = "echo $$ > " + pidFile + "; sleep 30 & echo $! >> " + pidFile + "; wait";
  await assert.rejects(
    () => runWorker({ manifest: m, outDir: join(dir, "shard-0"), command, timeoutMs: 200 }),
    (e) => e.code === "WORKER_ERROR" && /timed out/.test(e.details?.error ?? ""),
  );
  // Allow signal delivery to settle.
  await new Promise((r) => setTimeout(r, 200));
  const pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
  assert.equal(pids.length, 2, "command recorded sh pid and background pid");
  for (const pid of pids) {
    assert.throws(() => process.kill(pid, 0), (e) => e.code === "ESRCH");
  }
});

test("exec: SIGTERM-ignoring group members are escalated to SIGKILL", async () => {
  const dir = await tmpDir("ab-wsigkill-");
  const pidFile = join(dir, "pids");
  // Both sh and its background child ignore SIGTERM. sh still exits when its
  // last child dies, but with `wait` blocked the SIGKILL grace timer is the
  // only thing that can reap them.
  const command =
    'trap "" TERM; echo $$ > ' + pidFile +
    '; (trap "" TERM; sleep 30) & echo $! >> ' + pidFile + "; wait";
  const started = Date.now();
  await assert.rejects(
    () => runShell(command, { timeoutMs: 200, killGraceMs: 300 }),
    (e) => /timed out/.test(e.message),
  );
  assert.ok(Date.now() - started < 2000, "caller is not delayed by the grace period");
  const pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
  assert.equal(pids.length, 2, "command recorded sh pid and background pid");
  // Poll for SIGKILL delivery: both pids must be gone within ~1.5s.
  const deadline = Date.now() + 1500;
  for (;;) {
    const alive = pids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return e.code !== "ESRCH";
      }
    });
    if (alive.length === 0) break;
    assert.ok(Date.now() < deadline, "pids still alive after grace: " + alive.join(","));
    await new Promise((r) => setTimeout(r, 100));
  }
});

test("CLI worker: SIGTERM to the CLI still escalates SIGKILL to the group", async () => {
  const dir = await tmpDir("ab-cliterm-");
  const pidFile = join(dir, "pids");
  const m = createManifest({ runId: "run-ct", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }] });
  const manifestPath = join(dir, "m.json");
  await writeFile(manifestPath, JSON.stringify(m));
  // sh and its background child both ignore SIGTERM; only the armed SIGKILL
  // escalation can reap them. The CLI must not process.exit() before it fires.
  const command =
    'trap "" TERM; echo $$ > ' + pidFile +
    '; (trap "" TERM; sleep 30) & echo $! >> ' + pidFile + "; wait";
  const child = spawn("node", [CLI, "worker", "--manifest", manifestPath, "--out-dir", join(dir, "out"), "--command", command], {
    env: { ...process.env, ACTION_BUNDLE_KILL_GRACE_MS: "300" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Wait for the command to record both pids before signalling the CLI.
  const deadline = Date.now() + 10000;
  let pids = [];
  for (;;) {
    try {
      pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number).filter((n) => Number.isInteger(n));
    } catch {
      pids = [];
    }
    if (pids.length >= 2) break;
    assert.ok(Date.now() < deadline, "worker command did not record its pids");
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve) => child.on("close", (code) => resolve(code)));
  assert.equal(exitCode, 4, "CLI exits 4 after forwarded SIGTERM fails the worker");
  // The TERM-ignoring group members must be reaped by the SIGKILL escalation
  // (~300ms grace) before/shortly after the CLI exits — not orphaned.
  const reapDeadline = Date.now() + 5000;
  for (;;) {
    const alive = pids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return e.code !== "ESRCH";
      }
    });
    if (alive.length === 0) break;
    assert.ok(Date.now() < reapDeadline, "pids still alive after escalation: " + alive.join(","));
    await new Promise((r) => setTimeout(r, 100));
  }
});

test("exec: repeated forwarded SIGTERM does not postpone SIGKILL", async () => {
  // Child ignores SIGTERM entirely; the only escape is SIGKILL after the
  // grace measured from the FIRST termination request.
  const interval = setInterval(() => process.kill(process.pid, "SIGTERM"), 150);
  try {
    const started = Date.now();
    await assert.rejects(
      runShell('trap "" TERM; sleep 30', { killGraceMs: 500 }),
      (e) => /killed by signal SIGKILL/.test(e.message),
    );
    assert.ok(Date.now() - started < 1500, "SIGKILL fires ~grace after the first SIGTERM");
  } finally {
    clearInterval(interval);
  }
});

test("worker: failed command writes failed metadata AND throws", async () => {
  const dir = await tmpDir("ab-wfail-");
  const m = createManifest({ runId: "run-f", shardIndex: 0, shardCount: 1, tasks: [{ id: "a" }] });
  const outDir = join(dir, "shard-0");
  await assert.rejects(
    () => runWorker({ manifest: m, outDir, command: "echo worker-failure >&2; exit 17" }),
    (e) => e.code === "WORKER_ERROR",
  );
  const meta = JSON.parse(await readFile(join(outDir, "result-meta.json"), "utf8"));
  assert.equal(meta.status, "failed");
  assert.ok(meta.error, "error recorded");
  assert.equal(meta.shard, 0);
});

test("reduce: custom reducer runs with cwd and absolute env paths", async () => {
  const dir = await tmpDir("ab-redcwd-");
  const ws = join(dir, "workspace");
  const parts = join(dir, "parts");
  await mkdir(ws, { recursive: true });
  await mkdir(join(parts, "shard-0"), { recursive: true });
  await writeFile(join(parts, "shard-0", "output.txt"), "hello");
  // Reducer script lives in workspace/ and is invoked by relative path.
  await writeFile(join(ws, "merge.sh"), [
    "#!/bin/sh",
    "set -eu",
    "echo cwd=$(pwd) > \"" + "$ACTION_BUNDLE_OUTPUT" + "\"",
    "echo results=$ACTION_BUNDLE_RESULTS >> \"$ACTION_BUNDLE_OUTPUT\"",
    "cat $ACTION_BUNDLE_RESULTS/shard-0/output.txt >> \"$ACTION_BUNDLE_OUTPUT\"",
  ].join("\n"));
  const outPath = join(dir, "final.txt");
  await reduceResults({ partsDir: parts, shardCount: 1, command: "sh merge.sh", outPath, cwd: ws });
  const result = await readFile(outPath, "utf8");
  assert.ok(result.includes("cwd=" + ws), "reducer ran in workspace");
  assert.ok(result.includes("results=" + parts), "ACTION_BUNDLE_RESULTS is absolute");
  assert.ok(result.includes("hello"), "reducer read shard output");
});

test("reduce: invalid cwd fails clearly", async () => {
  const dir = await tmpDir("ab-badcwd-");
  await assert.rejects(
    () => reduceResults({ partsDir: dir, shardCount: 1, command: "true", outPath: join(dir, "o"), cwd: join(dir, "nonexistent") }),
    (e) => e.code === "REDUCTION_ERROR" && /cwd does not exist/.test(e.message),
  );
  const file = join(dir, "afile");
  await writeFile(file, "x");
  await assert.rejects(
    () => reduceResults({ partsDir: dir, shardCount: 1, command: "true", outPath: join(dir, "o"), cwd: file }),
    (e) => e.code === "REDUCTION_ERROR" && /not a directory/.test(e.message),
  );
});
