<div align="center">

# action-bundle

**하나의 작업을 N개의 병렬 GitHub Actions 샤드로 쪼개고, 결과를 하나의 번들로 합치는 도구**

[English](README.md) · [한국어](README_KO.md) · [简体中文](README_ZH.md)

[![shard-and-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/bundle.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/bundle.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

GitHub Actions는 퍼블릭 저장소에서 표준 러너 분당 요금이 무료다.
`action-bundle`은 이 특성을 활용해 큰 작업을 여러 matrix 잡으로 fan-out하고,
각 샤드의 부분 결과를 artifact로 모아 하나로 fan-in하는 패턴을 라이브러리 + CLI + 재사용 워크플로우로 제공한다.

```
setup ──▶ shard(0..N-1) 병렬 실행 ──▶ aggregate ──▶ bundle.json
           (각각 part-N.json 업로드)   (전부 다운로드 후 병합 + 검증)
```

## 설치

```bash
npm install action-bundle
# 또는 CLI만 쓰려면
npx action-bundle --help
```

요구사항: Node.js 20 이상.

## 빠른 시작 (라이브러리)

```ts
import { runShardToFile, bundleFromDir } from "action-bundle";

// 각 GitHub Actions 샤드 잡에서:
await runShardToFile({
  shardIndex: Number(process.env.SHARD_INDEX),  // matrix 값
  shardCount: Number(process.env.SHARD_COUNT),
  itemCount: 1000,
  outDir: "parts",
  processItem: (id) => myRealWork(id),          // 실제 작업으로 교체
});

// 집계 잡에서 모든 part-N.json을 내려받은 뒤:
const bundle = await bundleFromDir({
  partsDir: "parts",
  shardCount: 8,
  itemCount: 1000,
  outPath: "bundle.json",
});
console.log(bundle.totalProcessed); // 1000 — 누락/중복이 있으면 BundleError
```

## 빠른 시작 (CLI)

```bash
# 로컬에서 샤드 4개를 순차 실행해 보기
for i in 0 1 2 3; do
  npx action-bundle work --shard-index $i --shard-count 4 --item-count 100
done

# 하나로 병합 + 검증
npx action-bundle bundle --parts-dir parts --shard-count 4 --item-count 100
# → bundle complete: 100 items from 4 shards
```

## GitHub Actions에서 쓰기 (재사용 워크플로우)

이 저장소의 워크플로우는 `workflow_call`을 지원한다. 다른 저장소에서는
`.github/workflows/`에 아래 한 파일만 넣으면 된다:

```yaml
jobs:
  bundle:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/bundle.yml@main
    with:
      shard_count: "8"
      item_count: "200"
```

전체 예시: [examples/use-bundle.yml](examples/use-bundle.yml).
자체 matrix 워크플로우를 직접 꾸미려면 [docs/usage.md](docs/usage.md)를 참고.

## 왜 샤딩인가

| 샤드 수 | 이 저장소 CI에서의 벽시계 시간 | 비고 |
|---|---|---|
| 8 | ~23초 (run [36289249598](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36289249598)) | 샤드 잡 자체는 5~7초 |
| 16 | ~25초 (run [36289296353](https://github.com/flyingsquirrel0419/Action-bundle/actions/runs/36289296353)) | 오버헤드가 지배적 |

작업 자체가 짧으면 러너 부팅 + artifact 업/다운로드 비용이 병렬화 이득을 상쇄한다.
잡당 수 분 이상 걸리는 작업(대규모 테스트, 빌드 매트릭스)에서 진가를 발휘한다.

## API 요약

| 함수 | 역할 |
|---|---|
| `runShard(opts)` | 이 샤드의 몫을 실행하고 부분 결과 반환 |
| `runShardToFile(opts)` | 실행 후 `part-<index>.json`으로 저장 |
| `bundleParts(parts, shardCount, itemCount)` | 부분 결과 배열 병합 + 검증 |
| `bundleFromDir(opts)` | 디렉터리에서 `part-*.json`을 읽어 병합 |
| `shardOf(itemId, shardCount)` | item이 어느 샤드에 배정되는지 (결정론적) |

자세한 옵션과 오류 처리는 [docs/usage.md](docs/usage.md) 참고.

## 문서

- [docs/usage.md](docs/usage.md) — 상세 사용법, 워크플로우 연동, 트러블슈팅
- [PLAN.md](PLAN.md) — 설계 계획과 측정 계획
- [CONTRIBUTING.md](CONTRIBUTING.md) — 기여 방법
- [SECURITY.md](SECURITY.md) — 보안 이슈 신고
- [CHANGELOG.md](CHANGELOG.md) — 변경 이력

## 라이선스

[MIT](LICENSE)
