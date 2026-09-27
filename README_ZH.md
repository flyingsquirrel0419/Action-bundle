<div align="center">

# Action-bundle

**把 GitHub Actions 变成分布式计算池。**

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [简体中文](README_ZH.md) · [Español](README_ES.md)

[![action-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

把一个工作负载交给 Action-bundle,GitHub Actions 会在多个 runner 上并行执行,
最后返回一个经过验证的结果。

```
                 ┌─ Runner 0 ─┐
Workload ─ Split ├─ Runner 1 ─┼─ Collect ─ Verify ─ Reduce ─ Result
                 ├─ Runner 2 ─┤
                 └─ Runner N ─┘
```

GitHub Actions 的 `matrix` 只是创建并行作业;Action-bundle 是其上的一层,
处理每个人都要重写的部分 — 确定性分区、每个分片的版本化清单、
语言无关的 worker 契约、产物收集、完整性验证、归约 — 让你不再需要
自己设计 matrix 管道。

## 30 秒快速上手

在任何仓库中直接调用可复用工作流(无需安装库):

```yaml
# .github/workflows/distribute.yml
name: distribute
on:
  workflow_dispatch:

jobs:
  compute:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/run.yml@main
    with:
      workload: '{"kind":"index","count":2000}'
      shards: "8"
      reducer: "json-array"
```

这次运行会把 2,000 个任务切到 8 个 runner 上,执行内置的演示 worker,
验证每个任务恰好执行一次,然后上传 `final-result.json`。
要运行**你自己的**代码而不是演示 worker,使用库 + CLI —
见 [docs/github-actions.md](docs/github-actions.md)。

## 组成部分

| | |
|---|---|
| **Planner** | 把工作负载(索引范围、列表或显式任务) + 分片数(或 `auto`)变成确定性的执行计划 |
| **Partitioner** | `sha1(taskId) % shards` — 相同输入,相同分配,每次都一样 |
| **Manifest** | 每个分片的版本化 JSON:`{version, runId, shardIndex, shardCount, tasks}` |
| **Worker** | 你的命令,任意语言,设置好 `ACTION_BUNDLE_*` 环境变量 |
| **Collector** | 下载每个分片的 `result-meta.json` |
| **Verifier** | 对缺失/重复的分片或任务给出可操作的详细信息并明确失败 |
| **Reducer** | `concat`, `json-array`, `json-object`, `files`, `none`, 或自定义命令 |

## CLI

```bash
npm install action-bundle   # 或 npx action-bundle ...

# 查看工作负载会如何切分
action-bundle plan workload.json --shards 8

# 工作流内部使用的三个命令
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/
action-bundle reduce --parts-dir parts/ --shard-count 8 --strategy json-array --out result.json
```

退出码: `0` 成功 · `2` 配置/用法错误 · `3` 验证失败 · `4` 执行/归约失败。

## 库

```ts
import { createPlan, partition, verifyShards, reduceResults } from "action-bundle";

const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: "auto" });
```

完整 API: [docs/library.md](docs/library.md)。worker 环境变量:
[docs/worker-contract.md](docs/worker-contract.md)。

## 基准测试(实测,而非宣传)

真实 GitHub 托管 runner,20,000 个 CPU 密集任务(每个约 5ms):

| 分片数 | 计算时间(最慢分片) | 整体墙钟时间 | 加速比 |
|---|---|---|---|
| 1 | 100.0s | 127s | 1.0x |
| 4 | 25.9s | 87s | 3.6x |
| 16 | 6.6s | 68s | 14.0x |

计算时间几乎线性下降;墙钟时间不会,因为每次运行都有约 60 秒的固定开销
(runner 启动、checkout、setup、产物传输)。**当每个分片的计算量是分钟级
而不是秒级时才分片。** 方法论和运行链接: [benchmarks/README.md](benchmarks/README.md)。

## 适用场景

已经属于 CI 且耗时足够长的工作负载:大型测试套件、构建矩阵、对大量文件的
静态分析、批量仓库处理、代码生成、数据准备。

**不适用**: 不到一分钟的作业(开销占主导),以及任何超出 GitHub 使用政策的
用途 — 这是用于正当的仓库工作负载,不是免费的计算农场。Action-bundle 不是
Kubernetes/Ray/Spark;它是为已经运行在 GitHub Actions 里的工作准备的薄层。

## 文档

- [docs/concepts.md](docs/concepts.md) — 心智模型
- [docs/getting-started.md](docs/getting-started.md) — 在你的仓库中采用
- [docs/github-actions.md](docs/github-actions.md) — 工作流、限制、自定义 worker
- [docs/cli.md](docs/cli.md) · [docs/library.md](docs/library.md)
- [docs/reducers.md](docs/reducers.md) · [docs/worker-contract.md](docs/worker-contract.md)
- [docs/architecture.md](docs/architecture.md) — 为什么是 matrix + artifacts,没有服务器
- [docs/retries.md](docs/retries.md) — 重试/恢复的现状
- [docs/security.md](docs/security.md) · [docs/troubleshooting.md](docs/troubleshooting.md)

文档正文以英文维护。

## 贡献 / 安全 / 许可证

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)

