<div align="center">

# Action-bundle

**GitHub Actions를 분산 컴퓨트 풀로 바꾼다.**

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [简体中文](README_ZH.md) · [Español](README_ES.md)

[![action-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

Action-bundle에 워크로드 하나를 넘기면, GitHub Actions가 여러 러너에 걸쳐
병렬로 실행하고, 검증된 결과 하나를 돌려준다.

```
                 ┌─ Runner 0 ─┐
Workload ─ Split ├─ Runner 1 ─┼─ Collect ─ Verify ─ Reduce ─ Result
                 ├─ Runner 2 ─┤
                 └─ Runner N ─┘
```

GitHub Actions의 `matrix`는 병렬 잡을 만들 뿐이다. Action-bundle은 그 위에서
모두가 매번 직접 다시 짜는 부분 — 결정론적 파티셔닝, 샤드별 버전드 매니페스트,
언어 무관 워커 계약, 아티팩트 수집, 완전성 검증, 리덕션 — 을 처리해서
매트릭스 배관을 다시 설계할 필요가 없게 한다.

## 30초 퀵스타트

어떤 저장소에서든 재사용 워크플로우를 호출하면 된다 (라이브러리 설치 불필요):

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

이 실행은 2,000개 작업을 8개 러너로 나누고, 내장 데모 워커를 실행하고,
계획된 모든 작업이 정확히 한 번씩 완료 보고됐는지(각 결과가 자기 shard와
manifest에 묶여 있는지) 검증한 뒤 `final-result.json`을 업로드한다. 데모 워커
대신 **내 코드**를 돌리려면 같은 reusable workflow에 `command`(선택적으로
`reduce_command`)를 넘기면 된다 — 내 저장소 checkout 안에서 실행된다:

```yaml
    with:
      workload: '{"kind":"list","items":["a.py","b.py","c.py"]}'
      shards: "4"
      command: "python3 scripts/process.py"      # 내 워커
      reduce_command: "python3 scripts/merge.py" # 선택: 커스텀 병합
```

자세한 내용은 [docs/github-actions.md](docs/github-actions.md), 직접 workflow를
짜려면 라이브러리 + CLI를 쓰면 된다.

## 구성 요소

| | |
|---|---|
| **Planner** | 워크로드(인덱스 범위, 리스트, 명시적 태스크) + 샤드 수(또는 `auto`)를 결정론적 실행 계획으로 |
| **Partitioner** | `sha1(taskId) % shards` — 같은 입력, 같은 배정, 매번 |
| **Manifest** | 샤드별 버전드 JSON: `{version, runId, shardIndex, shardCount, tasks}` |
| **Worker** | 어떤 언어든 내 커맨드, `ACTION_BUNDLE_*` 환경 변수가 설정됨 |
| **Collector** | 모든 샤드의 `result-meta.json`을 다운로드 |
| **Verifier** | 누락/중복 샤드·태스크를 실행 가능한 상세 정보와 함께 명확히 실패 처리 |
| **Reducer** | `concat`, `json-array`, `json-object`, `files`, `none`, 또는 직접 만든 커맨드 |

## CLI

```bash
npm install action-bundle   # 또는 npx action-bundle ...

# 워크로드가 어떻게 쪼개질지 확인
action-bundle plan workload.json --shards 8

# 워크플로우가 내부적으로 쓰는 세 커맨드
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/
action-bundle reduce --parts-dir parts/ --shard-count 8 --strategy json-array --out result.json
```

종료 코드: `0` 성공 · `2` 잘못된 설정/사용법 · `3` 검증 실패 · `4` 실행/리덕션 실패.

## 라이브러리

```ts
import { createPlan, partition, verifyShards, reduceResults } from "action-bundle";

const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: "auto" });
```

전체 API: [docs/library.md](docs/library.md). 워커 환경 변수:
[docs/worker-contract.md](docs/worker-contract.md).

## 벤치마크 (마케팅이 아니라 실측)

> **과거 벤치마크** — 현재 runtime/workspace 아키텍처 이전에 측정한 값이다.
> 안정 릴리스 전에 다시 측정할 예정.

실제 GitHub 호스팅 러너, 20,000개 CPU 바운드 태스크 (개당 ~5ms):

| 샤드 | 계산 시간 (가장 느린 샤드) | 전체 벽시계 시간 | 가속 |
|---|---|---|---|
| 1 | 100.0s | 127s | 1.0x |
| 4 | 25.9s | 87s | 3.6x |
| 16 | 6.6s | 68s | 14.0x |

계산 시간은 거의 선형으로 줄지만 벽시계는 그렇지 않다 — 매 실행마다 ~60초의
고정 오버헤드(러너 부팅, checkout, setup, 아티팩트 전송)를 치르기 때문이다.
**샤드당 계산이 초가 아니라 분 단위일 때 샤딩하라.** 방법론과 실행 링크:
[benchmarks/README.md](benchmarks/README.md).

## 언제 쓰나

CI에 이미 속해 있고 충분히 오래 걸리는 워크로드: 대규모 테스트 스위트,
빌드 매트릭스, 다수 파일에 대한 정적 분석, 배치 저장소 처리, 코드 생성,
데이터 준비.

**쓰지 말 것**: 1분 미만 잡(오버헤드가 지배), GitHub 사용 정책을 벗어나는
모든 것 — 이건 합법적인 저장소 워크로드용이지 공짜 컴퓨트 팜이 아니다.
Action-bundle은 Kubernetes/Ray/Spark가 아니다. 이미 GitHub Actions 안에 있는
작업을 위한 얇은 레이어다.

## 문서

- [docs/concepts.md](docs/concepts.md) — 멘탈 모델
- [docs/getting-started.md](docs/getting-started.md) — 내 저장소에 도입
- [docs/github-actions.md](docs/github-actions.md) — 워크플로우, 제한, 커스텀 워커
- [docs/cli.md](docs/cli.md) · [docs/library.md](docs/library.md)
- [docs/reducers.md](docs/reducers.md) · [docs/worker-contract.md](docs/worker-contract.md)
- [docs/architecture.md](docs/architecture.md) — 왜 matrix + artifacts인가, 서버 없음
- [docs/retries.md](docs/retries.md) — 리트라이/재개의 현재 모습
- [docs/security.md](docs/security.md) · [docs/troubleshooting.md](docs/troubleshooting.md)

문서 전문은 영어로 유지된다.

## 기여 / 보안 / 라이선스

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)

