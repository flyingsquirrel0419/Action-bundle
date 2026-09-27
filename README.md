<div align="center">

# action-bundle

**Split one job into N parallel GitHub Actions shards, then merge the results into a single bundle**

[English](README.md) · [한국어](README_KO.md) · [简体中文](README_ZH.md)

[![shard-and-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/bundle.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/bundle.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

GitHub Actions standard runners are free for public repositories.
`action-bundle` turns that into a fan-out/fan-in pattern: split a large job
across a matrix of shard jobs, upload each partial result as an artifact,
then merge and verify everything in one aggregate job. Ships as a library,
a CLI, and a reusable workflow.

```
setup ──▶ shard(0..N-1) in parallel ──▶ aggregate ──▶ bundle.json
           (each uploads part-N.json)   (downloads all, merges, verifies)
```

## Install

```bash
npm install action-bundle
# or just the CLI
npx action-bundle --help
```

Requires Node.js 20 or later.

## Quickstart (library)

```ts
import { runShardToFile, bundleFromDir } from "action-bundle";

// In each GitHub Actions shard job:
await runShardToFile({
  shardIndex: Number(process.env.SHARD_INDEX),  // matrix value
  shardCount: Number(process.env.SHARD_COUNT),
  itemCount: 1000,
  outDir: "parts",
  processItem: (id) => myRealWork(id),          // replace with real work
});

// In the aggregate job, after downloading every part-N.json:
const bundle = await bundleFromDir({
  partsDir: "parts",
  shardCount: 8,
  itemCount: 1000,
  outPath: "bundle.json",
});
console.log(bundle.totalProcessed); // 1000 — BundleError on gaps/dupes
```

## Quickstart (CLI)

```bash
# Run 4 shards locally, sequentially
for i in 0 1 2 3; do
  npx action-bundle work --shard-index $i --shard-count 4 --item-count 100
done

# Merge and verify
npx action-bundle bundle --parts-dir parts --shard-count 4 --item-count 100
# → bundle complete: 100 items from 4 shards
```

## Use in GitHub Actions (reusable workflow)

This repo's workflow supports `workflow_call`. In any other repository,
drop one file into `.github/workflows/`:

```yaml
jobs:
  bundle:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/bundle.yml@main
    with:
      shard_count: "8"
      item_count: "200"
```

Full example: [examples/use-bundle.yml](examples/use-bundle.yml).
To build your own matrix workflow around the library, see [docs/usage.md](docs/usage.md).

## Why shard

| Shards | Wall-clock in this repo's CI | Notes |
|---|---|---|
| 8 | ~23s (run [36289249598](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36289249598)) | shard jobs themselves: 5–7s |
| 16 | ~25s (run [36289296353](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36289296353)) | overhead dominates |

For tiny workloads, runner boot + artifact transfer eats the parallel speedup.
The pattern pays off when each job takes minutes (large test suites, build matrices).

## API at a glance

| Function | Purpose |
|---|---|
| `runShard(opts)` | Run this shard's share, return the partial result |
| `runShardToFile(opts)` | Same, then write `part-<index>.json` |
| `bundleParts(parts, shardCount, itemCount)` | Merge + verify an array of parts |
| `bundleFromDir(opts)` | Read `part-*.json` from a directory and merge |
| `shardOf(itemId, shardCount)` | Deterministic shard assignment for an item |

Full options and error behavior: [docs/usage.md](docs/usage.md).

## Docs

- [docs/usage.md](docs/usage.md) — detailed usage, workflow integration, troubleshooting
- [PLAN.md](PLAN.md) — design plan and measurement goals
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [SECURITY.md](SECURITY.md) — report security issues
- [CHANGELOG.md](CHANGELOG.md) — release history

## License

[MIT](LICENSE)
