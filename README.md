# Action-bundle

GitHub Actions 퍼블릭 저장소의 무제한 분당 요금을 활용해, 하나의 작업을
여러 샤드 잡으로 병렬 실행하고 결과를 하나로 묶는 테스트 프로젝트.

## 빠른 시작

1. 이 저장소를 GitHub 퍼블릭 저장소로 push
2. Actions 탭에서 **shard-and-bundle** 워크플로우를 수동 실행
   (또는 아무 커밋이나 push하면 기본값 shard=8, items=200으로 자동 실행)
3. `aggregate` 잡이 끝나면 artifact `bundle-result`에서 최종 `bundle.json` 확인

## 다른 저장소에서 바로 쓰기 (재사용 워크플로우)

이 워크플로우는 `workflow_call`을 지원하므로, 다른 저장소에서는
아래 한 파일만 `.github/workflows/`에 넣으면 바로 쓸 수 있다.

```yaml
# .github/workflows/use-bundle.yml
name: use-bundle
on:
  workflow_dispatch:

jobs:
  bundle:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/bundle.yml@main
    with:
      shard_count: "8"
      item_count: "200"
```

복사 가능한 예시는 [examples/use-bundle.yml](examples/use-bundle.yml)에 있다.

## 이 프로젝트 자체를 템플릿으로 쓰기

GitHub 저장소 설정에서 **Template repository**를 켜면, "Use this template"
버튼으로 새 저장소에 전체 구조(워크플로우 + 도구)를 그대로 복사해 시작할 수 있다.

## 로컬에서 돌려보기

```bash
# 샤드 4개를 로컬에서 순차 실행
for i in 0 1 2 3; do
  python3 tools/work.py --shard-index $i --shard-count 4 --item-count 100
done

# 하나로 병합 + 검증
python3 tools/bundle.py --parts-dir parts/ --shard-count 4 --item-count 100
```

자세한 설계는 [PLAN.md](PLAN.md) 참고.
