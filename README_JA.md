<div align="center">

# Action-bundle

**GitHub Actions を分散コンピュートプールに変える。**

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [简体中文](README_ZH.md) · [Español](README_ES.md)

[![action-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

Action-bundle にワークロードを1つ渡せば、GitHub Actions が多数のランナーで
並列に実行し、検証済みの結果を1つ返す。

```
                 ┌─ Runner 0 ─┐
Workload ─ Split ├─ Runner 1 ─┼─ Collect ─ Verify ─ Reduce ─ Result
                 ├─ Runner 2 ─┤
                 └─ Runner N ─┘
```

GitHub Actions の `matrix` は並列ジョブを作るだけだ。Action-bundle はその上で、
誰もが毎回手書きする部分 — 決定論的パーティショニング、シャードごとの
バージョン付きマニフェスト、言語非依存のワーカー契約、アーティファクト収集、
完全性検証、リダクション — を処理し、マトリックスの配管を再設計する必要を
なくす。

## 30秒クイックスタート

どのリポジトリからでも再利用ワークフローを呼ぶだけ (ライブラリ不要):

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

この実行は 2,000 タスクを 8 ランナーに分割し、同梱のデモワーカーを実行し、
全タスクがちょうど1回ずつ実行されたことを検証して `final-result.json` を
アップロードする。デモワーカーではなく**自分のコード**を回すにはライブラリ
+ CLI を使う — [docs/github-actions.md](docs/github-actions.md) 参照。

## 構成要素

| | |
|---|---|
| **Planner** | ワークロード(インデックス範囲、リスト、明示タスク) + シャード数(または `auto`) を決定論的実行計画に |
| **Partitioner** | `sha1(taskId) % shards` — 同じ入力、同じ割り当て、毎回 |
| **Manifest** | シャードごとのバージョン付き JSON: `{version, runId, shardIndex, shardCount, tasks}` |
| **Worker** | 任意言語のコマンド。`ACTION_BUNDLE_*` 環境変数が設定される |
| **Collector** | 全シャードの `result-meta.json` をダウンロード |
| **Verifier** | シャード・タスクの欠落/重複を、対処可能な詳細付きで明示的に失敗させる |
| **Reducer** | `concat`, `json-array`, `json-object`, `files`, `none`, または独自コマンド |

## CLI

```bash
npm install action-bundle   # または npx action-bundle ...

# ワークロードがどう分割されるか確認
action-bundle plan workload.json --shards 8

# ワークフローが内部で使う3コマンド
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/
action-bundle reduce --parts-dir parts/ --shard-count 8 --strategy json-array --out result.json
```

終了コード: `0` 成功 · `2` 設定/用法エラー · `3` 検証失敗 · `4` 実行/リダクション失敗。

## ライブラリ

```ts
import { createPlan, partition, verifyShards, reduceResults } from "action-bundle";

const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: "auto" });
```

完全な API: [docs/library.md](docs/library.md)。ワーカー環境変数:
[docs/worker-contract.md](docs/worker-contract.md)。

## ベンチマーク (宣伝ではなく実測)

実際の GitHub ホストランナー、20,000 CPU バウンドタスク (各 ~5ms):

| シャード | 計算時間 (最遅シャード) | 全体の実時間 | 高速化 |
|---|---|---|---|
| 1 | 100.0s | 127s | 1.0x |
| 4 | 25.9s | 87s | 3.6x |
| 16 | 6.6s | 68s | 14.0x |

計算時間はほぼ線形に縮むが、実時間はそうならない — 各実行が ~60秒の固定
オーバーヘッド(ランナー起動、checkout、setup、アーティファクト転送)を
負うからだ。**シャードあたりの計算が秒ではなく分の規模のときにシャードせよ。**
方法論と実行リンク: [benchmarks/README.md](benchmarks/README.md)。

## 使いどき

CI に既に属していて、十分に時間のかかるワークロード: 大規模テストスイート、
ビルドマトリックス、多数ファイルへの静的解析、バッチリポジトリ処理、
コード生成、データ準備。

**使わない場面**: 1分未満のジョブ(オーバーヘッドが支配)、GitHub の利用
ポリシー外の用途 — これは正当なリポジトリワークロード向けであり、無料の
コンピュートファームではない。Action-bundle は Kubernetes/Ray/Spark ではない。
既に GitHub Actions 内にある仕事のための薄いレイヤーだ。

## ドキュメント

- [docs/concepts.md](docs/concepts.md) — メンタルモデル
- [docs/getting-started.md](docs/getting-started.md) — 自分のリポジトリに導入
- [docs/github-actions.md](docs/github-actions.md) — ワークフロー、制限、カスタムワーカー
- [docs/cli.md](docs/cli.md) · [docs/library.md](docs/library.md)
- [docs/reducers.md](docs/reducers.md) · [docs/worker-contract.md](docs/worker-contract.md)
- [docs/architecture.md](docs/architecture.md) — なぜ matrix + artifacts か、サーバー不要
- [docs/retries.md](docs/retries.md) — リトライ/レジュームの現状
- [docs/security.md](docs/security.md) · [docs/troubleshooting.md](docs/troubleshooting.md)

ドキュメント本文は英語で維持される。

## 貢献 / セキュリティ / ライセンス

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)

