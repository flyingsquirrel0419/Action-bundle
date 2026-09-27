# Action-bundle

GitHub Actions 퍼블릭 저장소의 무제한 분당 요금을 활용해, 하나의 작업을
여러 샤드 잡으로 병렬 실행하고 결과를 하나로 묶는 테스트 프로젝트.

## 빠른 시작

1. 이 저장소를 GitHub 퍼블릭 저장소로 push
2. Actions 탭에서 **shard-and-bundle** 워크플로우를 수동 실행
   (또는 아무 커밋이나 push하면 기본값 shard=8, items=200으로 자동 실행)
3. `aggregate` 잡이 끝나면 artifact `bundle-result`에서 최종 `bundle.json` 확인

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
