import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { ShardManifest } from "./manifest.js";
import { manifestDigest } from "./manifest.js";
import { ActionBundleError } from "./errors.js";

const execFileAsync = promisify(execFile);

export type ShardResultStatus = "success" | "failed";

export interface ShardResultMeta {
  version: 2;
  runId: string;
  shard: number;
  manifestDigest: string;
  status: ShardResultStatus;
  taskCount: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /**
   * Tasks the worker actually reported complete via completions.json.
   * Action-bundle no longer invents proof that arbitrary worker code ran
   * every task — this set comes from worker-produced evidence.
   */
  completedTaskIds: string[];
  outputs: string[];
  error?: string;
}

/** Environment variables exposed to worker commands. */
export const WORKER_ENV = {
  SHARD_INDEX: "ACTION_BUNDLE_SHARD_INDEX",
  SHARD_COUNT: "ACTION_BUNDLE_SHARD_COUNT",
  RUN_ID: "ACTION_BUNDLE_RUN_ID",
  MANIFEST: "ACTION_BUNDLE_MANIFEST",
  OUTPUT_DIR: "ACTION_BUNDLE_OUTPUT_DIR",
  COMPLETIONS: "ACTION_BUNDLE_COMPLETIONS",
} as const;

export interface WorkerRunOptions {
  manifest: ShardManifest;
  command?: string;
  outDir: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_WORKER_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Execute one shard: write manifest.json, expose ACTION_BUNDLE_* env vars,
 * run the command, then derive result-meta.json from the worker's evidence.
 *
 * Completion protocol: the worker reports finished tasks by writing
 * {"completedTaskIds": [...]} to $ACTION_BUNDLE_COMPLETIONS
 * (= <outDir>/completions.json). If the file is absent, completedTaskIds is
 * empty — a worker that exits 0 without reporting completions completes
 * nothing. Action-bundle records what the worker *reported*; it cannot prove
 * Byzantine correctness of arbitrary computation, and does not claim to.
 */
export async function runWorker(opts: WorkerRunOptions): Promise<ShardResultMeta> {
  const { manifest, outDir } = opts;
  const started = new Date();
  await mkdir(outDir, { recursive: true });

  const manifestPath = join(outDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const completionsPath = join(outDir, "completions.json");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    [WORKER_ENV.SHARD_INDEX]: String(manifest.shardIndex),
    [WORKER_ENV.SHARD_COUNT]: String(manifest.shardCount),
    [WORKER_ENV.RUN_ID]: manifest.runId,
    [WORKER_ENV.MANIFEST]: manifestPath,
    [WORKER_ENV.OUTPUT_DIR]: outDir,
    [WORKER_ENV.COMPLETIONS]: completionsPath,
  };

  log("shard " + manifest.shardIndex + "/" + manifest.shardCount);
  log("tasks: " + manifest.tasks.length);

  let status: ShardResultStatus = "success";
  let error: string | undefined;
  if (opts.command) {
    try {
      const { stdout, stderr } = await execFileAsync("sh", ["-c", opts.command], {
        env,
        cwd: process.cwd(),
        maxBuffer: 64 * 1024 * 1024,
        timeout: opts.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS,
        killSignal: "SIGTERM",
      });
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // Derive completed task ids from worker evidence, not from the plan.
  let completedTaskIds: string[] = [];
  try {
    const raw = await readFile(completionsPath, "utf8");
    const parsed = JSON.parse(raw) as { completedTaskIds?: unknown };
    if (Array.isArray(parsed.completedTaskIds)) {
      completedTaskIds = parsed.completedTaskIds.filter(
        (id): id is string => typeof id === "string",
      );
    }
  } catch {
    // No completions file -> nothing completed.
  }

  const finished = new Date();
  const meta: ShardResultMeta = {
    version: 2,
    runId: manifest.runId,
    shard: manifest.shardIndex,
    manifestDigest: manifestDigest(manifest),
    status,
    taskCount: manifest.tasks.length,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    completedTaskIds,
    outputs: [manifestPath],
    error,
  };
  const metaPath = join(outDir, "result-meta.json");
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  log("completed: " + meta.completedTaskIds.length + "/" + meta.taskCount);
  log("duration: " + (meta.durationMs / 1000).toFixed(1) + "s");
  return meta;
}

/** Digest helper for benchmark/demo workloads. */
export function digestRounds(seed: string, rounds: number): string {
  let digest = createHash("sha256").update(seed).digest("hex");
  for (let i = 0; i < rounds; i++) {
    digest = createHash("sha256").update(digest).digest("hex");
  }
  return digest;
}

function log(msg: string): void {
  console.log("[action-bundle] " + msg);
}

export class WorkerError extends ActionBundleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("WORKER_ERROR", message, details);
    this.name = "WorkerError";
  }
}

