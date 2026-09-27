import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ReductionError } from "./errors.js";

const execFileAsync = promisify(execFile);

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
}

/**
 * Reduce collected shard outputs into one final artifact.
 * Built-in strategies handle the common cases; command handles the rest.
 */
export async function reduceResults(opts: ReduceOptions): Promise<{ outPath: string; strategy: string }> {
  const { partsDir, shardCount } = opts;
  const strategy: BuiltinReducer | "custom" = opts.command ? "custom" : (opts.strategy ?? "concat");
  await mkdir(join(opts.outPath, ".."), { recursive: true }).catch(() => {});

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
        if (Array.isArray(parsed)) items.push(...parsed);
        else items.push(parsed);
      }
      await writeFile(opts.outPath, JSON.stringify(items, null, 2));
      return { outPath: opts.outPath, strategy };
    }
    case "json-object": {
      let merged: Record<string, unknown> = {};
      for (let i = 0; i < shardCount; i++) {
        const raw = await readShardOutput(partsDir, i, "output.json");
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new ReductionError("shard " + i + " output.json is not an object");
        }
        merged = { ...merged, ...(parsed as Record<string, unknown>) };
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
        } catch {
          listing["shard-" + i] = [];
        }
      }
      await writeFile(opts.outPath, JSON.stringify(listing, null, 2));
      return { outPath: opts.outPath, strategy };
    }
    case "none": {
      return { outPath: opts.outPath, strategy };
    }
    case "custom": {
      const env = {
        ...process.env,
        ACTION_BUNDLE_RESULTS: partsDir,
        ACTION_BUNDLE_OUTPUT: opts.outPath,
        ACTION_BUNDLE_SHARD_COUNT: String(shardCount),
      };
      try {
        const { stdout, stderr } = await execFileAsync("sh", ["-c", opts.command ?? ""], {
          env,
          maxBuffer: 64 * 1024 * 1024,
        });
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
      } catch (e) {
        throw new ReductionError("custom reduce command failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return { outPath: opts.outPath, strategy };
    }
  }
}

async function readShardOutput(partsDir: string, shard: number, name: string): Promise<string> {
  try {
    return await readFile(join(partsDir, "shard-" + shard, name), "utf8");
  } catch {
    throw new ReductionError("shard " + shard + " missing expected output " + name, {
      shard,
      name,
    });
  }
}

