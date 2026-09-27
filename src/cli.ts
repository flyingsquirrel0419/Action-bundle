#!/usr/bin/env node
import { runShardToFile } from "./work.js";
import { bundleFromDir } from "./bundle.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      throw new Error("unexpected argument: " + key);
    }
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

function usage(): never {
  console.error(
    [
      "action-bundle — shard work, then bundle results",
      "",
      "Usage:",
      "  action-bundle work --shard-index 0 --shard-count 8 --item-count 200 [--out-dir parts]",
      "  action-bundle bundle --parts-dir parts --shard-count 8 --item-count 200 [--out bundle.json]",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (cmd === "work") {
    const shardIndex = Number(args["shard-index"]);
    const shardCount = Number(args["shard-count"]);
    const itemCount = Number(args["item-count"]);
    const outDir = args["out-dir"] ?? "parts";
    const { path, part } = await runShardToFile({
      shardIndex,
      shardCount,
      itemCount,
      outDir,
    });
    console.log(
      "[shard " + part.shardIndex + "/" + part.shardCount + "] " +
        part.processed + " items -> " + path + " (" + part.elapsedSec + "s)",
    );
    return;
  }

  if (cmd === "bundle") {
    const bundle = await bundleFromDir({
      partsDir: args["parts-dir"] ?? "parts",
      shardCount: Number(args["shard-count"]),
      itemCount: Number(args["item-count"]),
      outPath: args.out ?? "bundle.json",
    });
    console.log(
      "bundle complete: " + bundle.totalProcessed + " items from " +
        bundle.shardCount + " shards",
    );
    console.log(
      "slowest shard: " + bundle.slowestShardSec +
        "s (wall-clock floor when run in parallel)",
    );
    return;
  }

  usage();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

