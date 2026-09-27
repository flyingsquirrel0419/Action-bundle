import { readFile, writeFile, readdir, mkdir, stat, access, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ReductionError } from "./errors.js";
import { runShell } from "./exec.js";

/** Per-shard output size ceiling (bytes) to bound reduction memory. */
export const MAX_SHARD_BYTES = 64 * 1024 * 1024;
/** Total bytes across all shards for in-memory reducers. */
export const MAX_TOTAL_RESULT_BYTES = 256 * 1024 * 1024;

export type BuiltinReducer = "concat" | "json-array" | "json-object" | "files" | "none";

export interface ReduceOptions {
  /** Directory containing shard-N/ subdirectories with outputs. */
  partsDir: string;
  shardCount: number;
  /** Built-in strategy name, or omit when using command. */
  strategy?: BuiltinReducer;
  /** Custom merge command; receives ACTION_BUNDLE_RESULTS and ACTION_BUNDLE_OUTPUT. */
  command?: string;
  outPath: string;
  /** Max milliseconds a custom command may run. Default 30 min. */
  timeoutMs?: number;
  /** Grace between SIGTERM and SIGKILL when terminating a custom command. Default 5s. */
  killGraceMs?: number;
  /**
   * Working directory for a custom reducer command (e.g. the caller
   * workspace). Built-in reducers ignore this. Must exist and be a directory.
   */
  cwd?: string;
}

const DEFAULT_REDUCE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Reduce collected shard outputs into one final artifact.
 * Built-in strategies handle the common cases; command handles the rest.
 */
export async function reduceResults(opts: ReduceOptions): Promise<{ outPath: string; strategy: string }> {
  const { partsDir, shardCount } = opts;
  const strategy: BuiltinReducer | "custom" = opts.command ? "custom" : (opts.strategy ?? "concat");
  await mkdir(dirname(opts.outPath), { recursive: true }).catch(() => {});

  const KNOWN: ReadonlySet<string> = new Set(["concat", "json-array", "json-object", "files", "none", "custom"]);
  if (!KNOWN.has(strategy)) {
    throw new ReductionError("unknown reduce strategy: " + String(strategy), {
      allowed: [...KNOWN].filter((s) => s !== "custom"),
    });
  }

  // Enforce a total-size ceiling for the in-memory reducers before reading,
  // so many individually-valid shard outputs cannot exhaust memory together.
  if (strategy === "concat" || strategy === "json-array" || strategy === "json-object") {
    const name = strategy === "concat" ? "output.txt" : "output.json";
    let total = 0;
    for (let i = 0; i < shardCount; i++) {
      try {
        const st = await stat(join(partsDir, "shard-" + i, name));
        total += st.size;
      } catch {
        // missing output is reported by readShardOutput during the merge
      }
      if (total > MAX_TOTAL_RESULT_BYTES) {
        throw new ReductionError(
          "total shard output exceeds the " + MAX_TOTAL_RESULT_BYTES + "-byte limit",
          { totalBytes: total, max: MAX_TOTAL_RESULT_BYTES },
        );
      }
    }
  }

  switch (strategy) {
    case "concat": {
      const chunks: string[] = [];
      for (let i = 0; i < shardCount; i++) {
        chunks.push(await readShardOutput(partsDir, i, "output.txt"));
      }
      await writeFile(opts.outPath, chunks.join(""));
      return { outPath: opts.outPath, strategy };
    }
    case "json-array": {
      const items: unknown[] = [];
      for (let i = 0; i < shardCount; i++) {
        const raw = await readShardOutput(partsDir, i, "output.json");
        const parsed = JSON.parse(raw);
        // Append item-by-item: spread of a huge array can exceed argument limits.
        if (Array.isArray(parsed)) {
          for (const item of parsed) items.push(item);
        }
        else items.push(parsed);
      }
      await writeFile(opts.outPath, JSON.stringify(items, null, 2));
      return { outPath: opts.outPath, strategy };
    }
    case "json-object": {
      const merged: Record<string, unknown> = Object.create(null);
      const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
      for (let i = 0; i < shardCount; i++) {
        const raw = await readShardOutput(partsDir, i, "output.json");
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new ReductionError("shard " + i + " output.json is not an object");
        }
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (FORBIDDEN.has(key)) {
            throw new ReductionError(
              "shard " + i + " output.json contains forbidden key: " + key,
              { shard: i, key },
            );
          }
          if (Object.prototype.hasOwnProperty.call(merged, key)) {
            throw new ReductionError(
              "duplicate key across shards: " + JSON.stringify(key) +
                " (shard " + i + "); use an explicit overwrite policy or rename keys",
              { shard: i, key },
            );
          }
          merged[key] = value;
        }
      }
      await writeFile(opts.outPath, JSON.stringify(merged, null, 2));
      return { outPath: opts.outPath, strategy };
    }
    case "files": {
      // Concatenate every shard's files/ directory listing into one manifest file.
      const listing: Record<string, string[]> = {};
      for (let i = 0; i < shardCount; i++) {
        const dir = join(partsDir, "shard-" + i, "files");
        try {
          listing["shard-" + i] = await readdir(dir);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            throw new ReductionError("shard " + i + " missing expected output files", { shard: i, name: "files" });
          }
          if (code === "ENOTDIR") {
            throw new ReductionError("shard " + i + " output files is not a directory", { shard: i, name: "files" });
          }
          throw e;
        }
      }
      await writeFile(opts.outPath, JSON.stringify(listing, null, 2));
      return { outPath: opts.outPath, strategy };
    }
    case "none": {
      return { outPath: opts.outPath, strategy };
    }
    case "custom": {
      // Validate the working directory before spawning.
      const cwd = opts.cwd ?? process.cwd();
      if (opts.cwd !== undefined) {
        let st;
        try {
          st = await stat(cwd);
        } catch {
          throw new ReductionError("reducer cwd does not exist: " + cwd, { cwd });
        }
        if (!st.isDirectory()) {
          throw new ReductionError("reducer cwd is not a directory: " + cwd, { cwd });
        }
      }
      // Absolute env paths: the reducer may run in a different cwd, so relative
      // results/output paths would otherwise break.
      const env = {
        ...process.env,
        ACTION_BUNDLE_RESULTS: resolve(partsDir),
        ACTION_BUNDLE_OUTPUT: resolve(opts.outPath),
        ACTION_BUNDLE_SHARD_COUNT: String(shardCount),
      };
      // A stale output file from a previous run is not proof this run
      // produced one — the postcondition below must check fresh output.
      await rm(opts.outPath, { force: true });
      try {
        await runShell(opts.command ?? "", {
          env,
          cwd,
          timeoutMs: opts.timeoutMs ?? DEFAULT_REDUCE_TIMEOUT_MS,
          killGraceMs: opts.killGraceMs,
        });
      } catch (e) {
        throw new ReductionError("custom reduce command failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      // Postcondition: a successful custom reducer must actually produce output.
      try {
        await access(opts.outPath);
      } catch {
        throw new ReductionError(
          "custom reduce command exited 0 but did not create " + opts.outPath,
          { outPath: opts.outPath },
        );
      }
      return { outPath: opts.outPath, strategy };
    }
  }
}

async function readShardOutput(partsDir: string, shard: number, name: string): Promise<string> {
  const path = join(partsDir, "shard-" + shard, name);
  try {
    const st = await stat(path);
    if (st.size > MAX_SHARD_BYTES) {
      throw new ReductionError(
        "shard " + shard + " output " + name + " exceeds the " + MAX_SHARD_BYTES + "-byte limit",
        { shard, name, bytes: st.size, max: MAX_SHARD_BYTES },
      );
    }
    return await readFile(path, "utf8");
  } catch (e) {
    if (e instanceof ReductionError) throw e;
    throw new ReductionError("shard " + shard + " missing expected output " + name, {
      shard,
      name,
    });
  }
}
