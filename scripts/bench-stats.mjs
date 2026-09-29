// Benchmark stats from GitHub Actions run ids (read-only; needs the `gh` CLI).
//
//   node scripts/bench-stats.mjs <run-id> [<run-id> ...]
//
// Per run: shard count, compute = slowest "Run shard N" step, wall-clock =
// run_started_at -> updated_at. Then the median per shard count.
import { execFileSync } from "node:child_process";

const REPO = process.env.BENCH_REPO || "flyingsquirrel0419/Action-bundle";
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: node scripts/bench-stats.mjs <run-id> [<run-id> ...]");
  process.exit(2);
}

const api = (path) => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
const secs = (a, b) => (Date.parse(b) - Date.parse(a)) / 1000;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const rows = [];
for (const id of ids) {
  const run = api("repos/" + REPO + "/actions/runs/" + id);
  if (run.conclusion !== "success") throw new Error("run " + id + " concluded " + run.conclusion);
  const jobs = api("repos/" + REPO + "/actions/runs/" + id + "/jobs?per_page=100").jobs;
  const steps = jobs.flatMap((j) => j.steps ?? []).filter((s) => /^Run shard \d+$/.test(s.name));
  if (steps.length === 0) throw new Error("run " + id + " has no shard steps");
  rows.push({
    id,
    shards: steps.length,
    compute: Math.max(...steps.map((s) => secs(s.started_at, s.completed_at))),
    wall: secs(run.run_started_at, run.updated_at),
  });
}

console.log("| Run | Shards | Compute (slowest shard) | Full run wall-clock |");
console.log("|---|---|---|---|");
for (const r of rows) console.log("| " + r.id + " | " + r.shards + " | " + r.compute + "s | " + r.wall + "s |");

const byShards = new Map();
for (const r of rows) byShards.set(r.shards, [...(byShards.get(r.shards) ?? []), r]);
const base = byShards.get(1);
const baseCompute = base ? median(base.map((r) => r.compute)) : undefined;
console.log("\n| Shards | Runs | Compute (median) | Wall-clock (median) | Compute speedup |");
console.log("|---|---|---|---|---|");
for (const [n, rs] of [...byShards].sort((a, b) => a[0] - b[0])) {
  const c = median(rs.map((r) => r.compute));
  const speedup = baseCompute ? (baseCompute / c).toFixed(1) + "x" : "n/a";
  console.log("| " + n + " | " + rs.length + " | " + c + "s | " + median(rs.map((r) => r.wall)) + "s | " + speedup + " |");
}
