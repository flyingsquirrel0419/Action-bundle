# Action-bundle 계획서

## 목적

GitHub Actions는 퍼블릭 저장소에서 분당 요금이 무제한(표준 러너)이다.
이 프로젝트는 그 특성을 이용해 **하나의 작업을 여러 샤드(shard) 잡으로 쪼개서
병렬로 돌리고, 결과를 하나로 묶어(bundle) 집계하는 파이프라인**을 실험한다.

## 전체 구조

```
                 ┌──────────────────────────────┐
                 │ workflow_dispatch (shard 수  │
                 │ / item 수 입력) 또는 push     │
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │ setup 잡                      │
                 │  - 샤드 수 결정               │
                 │  - matrix 출력 생성           │
                 └──────────────┬───────────────┘
                                │  (N개 샤드로 fan-out)
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
   │ shard-0 잡  │       │ shard-1 잡  │  ...  │ shard-N 잡  │
   │ (matrix)    │       │ (matrix)    │       │ (matrix)    │
   │             │       │             │       │             │
   │ work.py가    │       │ work.py가  │       │ work.py가   │
   │ 자기 몫의    │       │ 자기 몫의   │       │ 자기 몫의   │
   │ item 처리   │       │ item 처리   │       │ item 처리   │
   │             │       │             │       │             │
   │ 부분 결과를  │       │ 부분 결과를 │       │ 부분 결과를 │
   │ artifact로  │       │ artifact로  │       │ artifact로  │
   │ 업로드      │       │ 업로드      │       │ 업로드      │
   └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
          └─────────────────────┼─────────────────────┘
                                │  (fan-in)
                 ┌──────────────▼───────────────┐
                 │ aggregate 잡                  │
                 │  - download-artifact로 전부   │
                 │    부분 결과 수집             │
                 │  - bundle.py로 병합           │
                 │  - 최종 bundle.json + 요약    │
                 │  - 잡 summary에 표 출력       │
                 └──────────────────────────────┘
```

## 핵심 아이디어

1. **fan-out (쪼개기)**: `strategy.matrix`로 N개의 샤드 잡을 병렬 실행한다.
   퍼블릭 저장소는 GitHub 호스팅 러너의 분당 요금이 0원이므로, 샤드 수를
   늘려도 비용 부담 없이 벽시계 시간을 줄일 수 있다.
2. **fan-in (묶기)**: 각 샤드는 `actions/upload-artifact`로 부분 결과를
   남기고, 마지막 잡이 `actions/download-artifact`로 전부 내려받아
   하나의 번들로 병합한다. 이것이 잡 사이의 유일한 데이터 전달 수단이다.
   (캐시도 가능하지만 eventual consistency라 집계에는 부적합.)
3. **결정론(determinism)**: 동일한 입력에 대해 샤드 분할과 병합 결과가
   같아야 한다. 샤드 배정은 `hash(item) % shard_count`로 고정한다.

## 구성 요소

| 파일 | 역할 |
|---|---|
| `tools/work.py` | 입력 item 목록을 샤드 규칙에 따라 나누고, 자기 샤드의 부분 결과(`part-N.json`) 생성 |
| `tools/bundle.py` | 여러 `part-N.json`을 하나의 `bundle.json`으로 병합하고 검증 |
| `.github/workflows/bundle.yml` | setup → shard(matrix) → aggregate 3단계 파이프라인 |

## 실행 방법

1. push 또는 수동 실행(`workflow_dispatch`)으로 워크플로우 트리거
2. 수동 실행 시 `shard_count`(샤드 수), `item_count`(테스트 작업량) 입력 가능
3. `aggregate` 잡이 끝나면 artifact `bundle-result`에 최종 `bundle.json` 저장,
   잡 요약 화면에 샤드별 처리량 표 출력

## 검증 계획

- 로컬: `work.py`를 여러 샤드로 직접 실행 → `bundle.py`로 병합 →
  전체 item이 정확히 1번씩만 처리됐는지 검증 (중복/누락 없음)
- 원격: 실제 GitHub 저장소에 push해서 워크플로우가 fan-out/fan-in을
  수행하는지 확인 (repo 연결 시)

## 측정할 것

- 샤드 수를 1 → 8 → 16으로 늘릴 때 전체 벽시계 시간 변화
- 병렬화 오버헤드(러너 부팅, artifact 업/다운로드)가 어느 규모부터
  이득을 상쇄하는지
