#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createPlan } from "./planner.js";
import { createManifest, parseManifest } from "./manifest.js";
import { runWorker } from "./worker.js";
import { collectFromDir } from "./collector.js";
import { verifyShards } from "./verify.js";
import { reduceResults, type BuiltinReducer } from "./reduce.js";
import { ActionBundleError } from "./errors.js";
import type { Workload } from "./task.js";

// Exit codes: 0 ok, 2 invalid config/usage, 3 verification failure, 4 execution/reduction failure.

function parseFlags(argv: string[]): { flags: Record<string, string>; pos: string[] } {
  const flags: Record<string, string> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

function usage(): never {
  console.error(
    [
      "action-bundle — turn GitHub Actions into a distributed compute pool",
      "",
      "Commands:",
      "  plan     <workload.json> --shards 8 [--max-shards 32] [--min-tasks-per-shard 1]",
      "  worker   --manifest manifest.json [--command \"sh ...\"] --out-dir dir",
      "  verify   --parts-dir dir --shard-count 8 --manifests-dir dir",
      "  reduce   --parts-dir dir --shard-count 8 [--strategy concat|json-array|json-object|files|none] [--command \"sh ...\"] --out result",
      "",
      "Workload file: {\"kind\":\"index\",\"count\":1000} | {\"kind\":\"list\",\"items\":[...]} | {\"kind\":\"tasks\",\"tasks\":[{\"id\":...}]}",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

function fail(err: unknown): never {
  if (err instanceof ActionBundleError) {
    console.error("[action-bundle] " + err.name + " (" + err.code + ")");
    console.error(err.message);
    if (err.details) console.error(JSON.stringify(err.details, null, 2));
    process.exit(err.code === "INVALID_CONFIG" ? 2 : err.code.startsWith("MISSING") || err.code.startsWith("DUPLICATE") || err.code === "UNEXPECTED_SHARD_COUNT" || err.code === "MALFORMED_RESULT" ? 3 : 4);
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(4);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") usage();
  const { flags, pos } = parseFlags(rest);

  if (cmd === "plan") {
    const workloadPath = pos[0];
    if (!workloadPath) usage();
    const workload = (await readJson(workloadPath)) as Workload;
    const shards = flags.shards === "auto" ? "auto" : Number(flags.shards ?? 8);
    const plan = createPlan({
      workload,
      shards,
      maxShards: flags["max-shards"] ? Number(flags["max-shards"]) : undefined,
      minTasksPerShard: flags["min-tasks-per-shard"] ? Number(flags["min-tasks-per-shard"]) : undefined,
    });
    console.log("Action-bundle execution plan");
    console.log("  runId        " + plan.runId);
    console.log("  tasks        " + plan.taskCount);
    console.log("  shards       " + plan.shardCount);
    console.log("  tasks/shard  ~" + Math.ceil(plan.taskCount / plan.shardCount));
    for (const s of plan.shards) {
      console.log("    " + s.shardIndex + "  " + s.taskCount);
    }
    if (flags.out) {
      await writeFile(flags.out, JSON.stringify(plan, null, 2));
      console.log("  plan written to " + flags.out);
    }
    return;
  }

  if (cmd === "worker") {
    const manifestRaw = await readJson(flags.manifest ?? "");
    const manifest = parseManifest(manifestRaw);
    const meta = await runWorker({
      manifest,
      command: flags.command,
      outDir: flags["out-dir"] ?? ".",
    });
    console.log(JSON.stringify(meta, null, 2));
    return;
  }

  if (cmd === "verify") {
    const shardCount = Number(flags["shard-count"]);
    const manifestsDir = flags["manifests-dir"] ?? "";
    const manifests = [];
    for (let i = 0; i < shardCount; i++) {
      manifests.push(parseManifest(await readJson(join(manifestsDir, "manifest-" + i + ".json"))));
    }
    const collected = await collectFromDir(flags["parts-dir"] ?? "", shardCount);
    const report = verifyShards({ manifests, collected, shardCount });
    console.log("[action-bundle] expected shards: " + shardCount);
    console.log("[action-bundle] received shards: " + collected.length);
    console.log("[action-bundle] verified tasks: " + report.verifiedTasks + "/" + report.expectedTasks);
    console.log("[action-bundle] verification OK");
    return;
  }

  if (cmd === "reduce") {
    const res = await reduceResults({
      partsDir: flags["parts-dir"] ?? "",
      shardCount: Number(flags["shard-count"]),
      strategy: flags.strategy as BuiltinReducer | undefined,
      command: flags.command,
      outPath: flags.out ?? "bundle-result.json",
    });
    console.log("[action-bundle] reduction complete: " + res.strategy + " -> " + res.outPath);
    return;
  }

  usage();
}

main().catch(fail);
