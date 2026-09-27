# 사용 가이드 (Usage Guide)

[English below](#english) · 한국어

## 한국어

### 구성 요소

| 파일/모듈 | 역할 |
|---|---|
| `src/shard.ts` | 결정론적 샤드 배정 (`sha1("item-<id>") % shardCount`) |
| `src/work.ts` | 샤드 워커 — 자기 몫 실행 후 `part-<index>.json` 생성 |
| `src/bundle.ts` | 병합기 — 모든 part를 하나로 합치고 커버리지 검증 |
| `src/cli.ts` | `work` / `bundle` 서브커맨드 |
| `.github/workflows/bundle.yml` | setup → shard(matrix) → aggregate 재사용 워크플로우 |

### 라이브러리 상세

#### `runShard(opts) → PartFile`

| 옵션 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `shardIndex` | number | ✓ | 이 잡의 샤드 번호 (0-based) |
| `shardCount` | number | ✓ | 전체 샤드 수 |
| `itemCount` | number | ✓ | 전체 item 수 |
| `processItem` | (id: number) => string | | item 처리 함수. 생략 시 데모용 해시 워크로드 |

범위 밖 `shardIndex`는 `RangeError`를 던진다.

#### `bundleParts(parts, shardCount, itemCount) → BundleResult`

검증 규칙(하나라도 깨지면 `BundleError`):

- 0..shardCount-1 모든 샤드의 part가 있어야 함 (누락 불가)
- 같은 item을 두 샤드가 처리하면 안 됨 (중복 불가)
- 병합된 id가 0..itemCount-1을 정확히 커버해야 함

#### `bundleFromDir({ partsDir, shardCount, itemCount, outPath? })`

`partsDir`에서 `part-0.json`..`part-(N-1).json`을 읽어 병합한다.
`outPath`를 주면 `bundle.json`을 파일로도 저장한다.

### CLI 상세

```bash
action-bundle work --shard-index 0 --shard-count 8 --item-count 200 [--out-dir parts]
action-bundle bundle --parts-dir parts --shard-count 8 --item-count 200 [--out bundle.json]
```

종료 코드: 성공 0, 검증 실패/인자 오류 1, 사용법 오류 2.

### GitHub Actions 연동 (직접 matrix 구성)

```yaml
jobs:
  shard:
    strategy:
      fail-fast: false
      matrix:
        shard: [0, 1, 2, 3, 4, 5, 6, 7]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          npx action-bundle work \
            --shard-index ${{ matrix.shard }} \
            --shard-count 8 \
            --item-count 1000 \
            --out-dir parts/
      - uses: actions/upload-artifact@v4
        with:
          name: shard-part-${{ matrix.shard }}
          path: parts/part-${{ matrix.shard }}.json

  aggregate:
    needs: shard
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: shard-part-*
          path: parts/
          merge-multiple: true
      - run: |
          npx action-bundle bundle \
            --parts-dir parts/ --shard-count 8 --item-count 1000 \
            --out bundle.json
```

핵심 규칙:

- 샤드 간 데이터 전달은 **artifact만** 사용한다. `actions/cache`는 eventual
  consistency라 집계에 부적합하다.
- `fail-fast: false`를 켜서 한 샤드 실패가 다른 샤드를 취소하지 않게 한다.
  (어차피 누락 샤드는 `bundle` 단계에서 `BundleError`로 잡힌다.)
- 재사용 워크플로우를 그대로 쓰려면 [examples/use-bundle.yml](../examples/use-bundle.yml) 참고.

### 트러블슈팅

<details>
<summary><strong>aggregate 잡이 "missing shard parts"로 실패한다</strong></summary>

원인: 일부 샤드 잡이 실패했거나 artifact 업로드에 실패했다.

1. 실패한 샤드 잡의 로그를 확인한다.
2. 해당 샤드만 재실행하거나, 전체 워크플로우를 재실행한다.
3. matrix가 동적으로 생성된 경우, setup 잡 출력의 `shard_count`와
   aggregate에 전달된 값이 일치하는지 확인한다.

</details>

<details>
<summary><strong>로컬에서는 되는데 CI에서 "Cannot find module"가 난다</strong></summary>

라이브러리로 쓸 때는 `npm install action-bundle` 후 `dist`가 빌드된
패키지를 import해야 한다. 저장소 소스를 직접 import하려면 먼저
`npm run build`가 필요하다.

</details>

---

## English

### Components

| File/module | Role |
|---|---|
| `src/shard.ts` | Deterministic shard assignment (`sha1("item-<id>") % shardCount`) |
| `src/work.ts` | Shard worker — runs its share, writes `part-<index>.json` |
| `src/bundle.ts` | Merger — combines all parts, verifies coverage |
| `src/cli.ts` | `work` / `bundle` subcommands |
| `.github/workflows/bundle.yml` | setup → shard(matrix) → aggregate reusable workflow |

### Library details

#### `runShard(opts) → PartFile`

| Option | Type | Required | Description |
|---|---|---|---|
| `shardIndex` | number | ✓ | This job's shard number (0-based) |
| `shardCount` | number | ✓ | Total number of shards |
| `itemCount` | number | ✓ | Total number of items |
| `processItem` | (id: number) => string | | Per-item processor. Defaults to a demo hash workload |

Out-of-range `shardIndex` throws `RangeError`.

#### `bundleParts(parts, shardCount, itemCount) → BundleResult`

Verification (any violation throws `BundleError`):

- A part exists for every shard 0..shardCount-1 (no gaps)
- No item processed by two shards (no duplicates)
- Merged ids exactly cover 0..itemCount-1

#### `bundleFromDir({ partsDir, shardCount, itemCount, outPath? })`

Reads `part-0.json`..`part-(N-1).json` from `partsDir` and merges.
With `outPath`, also writes `bundle.json` to disk.

### CLI details

```bash
action-bundle work --shard-index 0 --shard-count 8 --item-count 200 [--out-dir parts]
action-bundle bundle --parts-dir parts --shard-count 8 --item-count 200 [--out bundle.json]
```

Exit codes: 0 success, 1 verification/argument failure, 2 usage error.

### GitHub Actions integration (custom matrix)

See the Korean section above for a complete example — YAML is identical
in every language. Key rules:

- Pass data between shards **only via artifacts**. `actions/cache` is
  eventually consistent and unfit for aggregation.
- Use `fail-fast: false` so one failing shard does not cancel the rest.
  (A missing shard fails loudly at the `bundle` step anyway.)
- To reuse this repo's workflow as-is, see [examples/use-bundle.yml](../examples/use-bundle.yml).

### Troubleshooting

<details>
<summary><strong>Aggregate job fails with "missing shard parts"</strong></summary>

Cause: some shard jobs failed, or artifact upload failed.

1. Check the failing shard job's logs.
2. Re-run the failed shards, or re-run the whole workflow.
3. If the matrix is generated dynamically, confirm `shard_count` from the
   setup job matches what aggregate receives.

</details>

<details>
<summary><strong>Works locally, "Cannot find module" in CI</strong></summary>

When used as a library, install `action-bundle` from npm and import the
built `dist` output. To import from this source tree directly, run
`npm run build` first.

</details>

