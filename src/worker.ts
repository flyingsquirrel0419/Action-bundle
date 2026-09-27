import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { ShardManifest } from "./manifest.js";
import { ActionBundleError } from "./errors.js";

const execFileAsync = promisify(execFile);

export interface ShardResultMeta {
  version: 1;
  shard: number;
  status: "success" | "failed";
  taskCount: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Task ids actually completed, reported by the worker run. */
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
} as const;

export interface WorkerRunOptions {
  manifest: ShardManifest;
  /** Language-agnostic command run by the shard, e.g. "python process.py". */
  command?: string;
  outDir: string;
  /** Extra env for the child process. */
  env?: Record<string, string>;
  /** Max milliseconds the command may run before SIGTERM. Default 30 min. */
  timeoutMs?: number;
}

const DEFAULT_WORKER_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Execute one shard: write manifest.json, expose ACTION_BUNDLE_* env vars,
 * run the command (if any), then write result-meta.json. The command is
 * expected to write its own outputs into outDir; meta is tracked separately.
 */
export async function runWorker(opts: WorkerRunOptions): Promise<ShardResultMeta> {
  const { manifest, outDir } = opts;
  const started = new Date();
  await mkdir(outDir, { recursive: true });

  const manifestPath = join(outDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    [WORKER_ENV.SHARD_INDEX]: String(manifest.shardIndex),
    [WORKER_ENV.SHARD_COUNT]: String(manifest.shardCount),
    [WORKER_ENV.RUN_ID]: manifest.runId,
    [WORKER_ENV.MANIFEST]: manifestPath,
    [WORKER_ENV.OUTPUT_DIR]: outDir,
  };

  log("shard " + manifest.shardIndex + "/" + manifest.shardCount);
  log("tasks: " + manifest.tasks.length);

  let status: "success" | "failed" = "success";
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

  const finished = new Date();
  const meta: ShardResultMeta = {
    version: 1,
    shard: manifest.shardIndex,
    status,
    taskCount: manifest.tasks.length,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    completedTaskIds: status === "success" ? manifest.tasks.map((t) => t.id) : [],
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

/** Worker command failed. */
export class WorkerError extends ActionBundleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("WORKER_ERROR", message, details);
    this.name = "WorkerError";
  }
}
