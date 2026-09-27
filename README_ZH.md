<div align="center">

# action-bundle

**把一个任务拆成 N 个并行的 GitHub Actions 分片(shard),再把结果合并成一个 bundle**

[English](README.md) · [한국어](README_KO.md) · [简体中文](README_ZH.md)

[![shard-and-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/bundle.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/bundle.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

GitHub Actions 在公共仓库中标准 runner 免费。
`action-bundle` 利用这一点实现 fan-out/fan-in 模式:把大任务拆到 matrix
分片作业中并行执行,每个分片把部分结果作为 artifact 上传,
最后在聚合作业中合并并校验。以库 + CLI + 可复用工作流的形式提供。

```
setup ──▶ shard(0..N-1) 并行执行 ──▶ aggregate ──▶ bundle.json
           (各自上传 part-N.json)    (下载全部、合并、校验)
```

## 安装

```bash
npm install action-bundle
# 或只用 CLI
npx action-bundle --help
```

要求 Node.js 20 及以上。

## 快速开始(库)

```ts
import { runShardToFile, bundleFromDir } from "action-bundle";

// 在每个 GitHub Actions 分片作业中:
await runShardToFile({
  shardIndex: Number(process.env.SHARD_INDEX),  // matrix 值
  shardCount: Number(process.env.SHARD_COUNT),
  itemCount: 1000,
  outDir: "parts",
  processItem: (id) => myRealWork(id),          // 替换为实际任务
});

// 在聚合作业中,下载所有 part-N.json 之后:
const bundle = await bundleFromDir({
  partsDir: "parts",
  shardCount: 8,
  itemCount: 1000,
  outPath: "bundle.json",
});
console.log(bundle.totalProcessed); // 1000 — 有缺失/重复会抛 BundleError
```

## 快速开始(CLI)

```bash
# 本地依次运行 4 个分片
for i in 0 1 2 3; do
  npx action-bundle work --shard-index $i --shard-count 4 --item-count 100
done

# 合并并校验
npx action-bundle bundle --parts-dir parts --shard-count 4 --item-count 100
# → bundle complete: 100 items from 4 shards
```

## 在 GitHub Actions 中使用(可复用工作流)

本仓库的工作流支持 `workflow_call`。在其他仓库中,
只需在 `.github/workflows/` 放一个文件:

```yaml
jobs:
  bundle:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/bundle.yml@main
    with:
      shard_count: "8"
      item_count: "200"
```

完整示例:[examples/use-bundle.yml](examples/use-bundle.yml)。
如需基于该库自建 matrix 工作流,见 [docs/usage.md](docs/usage.md)。

## 为什么分片

| 分片数 | 本仓库 CI 墙钟时间 | 备注 |
|---|---|---|
| 8 | ~23 秒 (run [36289249598](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36289249598)) | 分片作业本身 5–7 秒 |
| 16 | ~25 秒 (run [36289296353](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36289296353)) | 开销占主导 |

任务很短时,runner 启动 + artifact 传输会抵消并行收益。
当单个作业需要数分钟(大型测试套件、构建矩阵)时收益明显。

## API 一览

| 函数 | 作用 |
|---|---|
| `runShard(opts)` | 执行本分片的任务并返回部分结果 |
| `runShardToFile(opts)` | 同上,并写入 `part-<index>.json` |
| `bundleParts(parts, shardCount, itemCount)` | 合并 + 校验部分结果数组 |
| `bundleFromDir(opts)` | 从目录读取 `part-*.json` 并合并 |
| `shardOf(itemId, shardCount)` | 确定性的分片分配 |

完整选项与错误行为见 [docs/usage.md](docs/usage.md)。

## 文档

- [docs/usage.md](docs/usage.md) — 详细用法、工作流集成、故障排除
- [PLAN.md](PLAN.md) — 设计计划与测量目标
- [CONTRIBUTING.md](CONTRIBUTING.md) — 贡献指南
- [SECURITY.md](SECURITY.md) — 安全问题报告
- [CHANGELOG.md](CHANGELOG.md) — 发布历史

## 许可证

[MIT](LICENSE)
