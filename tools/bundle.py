#!/usr/bin/env python3
"""집계기: part-N.json 파일들을 하나의 bundle.json으로 병합하고 검증한다.

사용법:
    python3 tools/bundle.py --parts-dir parts/ --shard-count 8 \
        --item-count 200 --out bundle.json

검증 규칙:
    - 샤드 개수가 shard_count와 정확히 일치해야 함 (누락 샤드 불가)
    - 병합된 item id에 중복이 없어야 함
    - 병합된 item id가 0..item_count-1 전체를 정확히 커버해야 함
"""
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parts-dir", type=str, required=True)
    parser.add_argument("--shard-count", type=int, required=True)
    parser.add_argument("--item-count", type=int, required=True)
    parser.add_argument("--out", type=str, default="bundle.json")
    args = parser.parse_args()

    parts = []
    missing = []
    for idx in range(args.shard_count):
        path = os.path.join(args.parts_dir, f"part-{idx}.json")
        if not os.path.exists(path):
            missing.append(idx)
            continue
        with open(path) as f:
            parts.append(json.load(f))

    if missing:
        print(f"오류: 누락된 샤드 결과: {missing}", file=sys.stderr)
        return 1

    merged = []
    per_shard = []
    for p in sorted(parts, key=lambda x: x["shard_index"]):
        merged.extend(p["items"])
        per_shard.append({
            "shard": p["shard_index"],
            "processed": p["processed"],
            "elapsed_sec": p["elapsed_sec"],
        })

    ids = [it["id"] for it in merged]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        print(f"오류: 중복 처리된 item: {sorted(dupes)[:10]}", file=sys.stderr)
        return 1

    expected = set(range(args.item_count))
    got = set(ids)
    missing_items = expected - got
    extra_items = got - expected
    if missing_items or extra_items:
        print(f"오류: 커버리지 불일치 누락={sorted(missing_items)[:10]} "
              f"초과={sorted(extra_items)[:10]}", file=sys.stderr)
        return 1

    bundle = {
        "item_count": args.item_count,
        "shard_count": args.shard_count,
        "total_processed": len(merged),
        "per_shard": per_shard,
        "slowest_shard_sec": max(s["elapsed_sec"] for s in per_shard),
        "items": sorted(merged, key=lambda x: x["id"]),
    }
    with open(args.out, "w") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    print(f"번들 완성: {len(merged)}개 item, "
          f"{args.shard_count}개 샤드 → {args.out}")
    print(f"가장 느린 샤드: {bundle['slowest_shard_sec']}s "
          f"(병렬 실행 시 이것이 벽시계 시간의 하한)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
