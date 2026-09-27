#!/usr/bin/env python3
"""샤드 워커: 전체 item 중 자기 몫만 처리해 부분 결과(part-N.json)를 만든다.

사용법:
    python3 tools/work.py --shard-index 0 --shard-count 8 --item-count 200 \
        --out-dir parts/

출력:
    parts/part-0.json  형식: {
        "shard_index": 0,
        "shard_count": 8,
        "items": [{"id": ..., "digest": ..., "shard": 0}, ...],
        "processed": <int>
    }
"""
import argparse
import hashlib
import json
import os
import time


def item_belongs_to_shard(item_id: int, shard_index: int, shard_count: int) -> bool:
    """결정론적 샤드 배정: sha1(item) % shard_count == shard_index."""
    digest = hashlib.sha1(f"item-{item_id}".encode()).hexdigest()
    return int(digest, 16) % shard_count == shard_index


def process_item(item_id: int, intensity: int = 200) -> dict:
    """item 하나를 처리한다. sha256을 intensity번 반복해 CPU를 쓴다."""
    payload = f"item-{item_id}".encode()
    digest = hashlib.sha256(payload).hexdigest()
    # 가짜 연산: 해시를 반복해서 CPU를 쓴다. intensity로 무게 조절.
    for _ in range(intensity):
        digest = hashlib.sha256(digest.encode()).hexdigest()
    return {"id": item_id, "digest": digest[:16]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shard-index", type=int, required=True)
    parser.add_argument("--shard-count", type=int, required=True)
    parser.add_argument("--item-count", type=int, required=True)
    parser.add_argument("--work-intensity", type=int, default=200)
    parser.add_argument("--out-dir", type=str, default="parts")
    args = parser.parse_args()

    if not (0 <= args.shard_index < args.shard_count):
        raise SystemExit(f"shard-index는 0..{args.shard_count - 1} 범위여야 함")

    started = time.time()
    mine = [
        i for i in range(args.item_count)
        if item_belongs_to_shard(i, args.shard_index, args.shard_count)
    ]
    results = []
    for item_id in mine:
        r = process_item(item_id, args.work_intensity)
        r["shard"] = args.shard_index
        results.append(r)

    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, f"part-{args.shard_index}.json")
    payload = {
        "shard_index": args.shard_index,
        "shard_count": args.shard_count,
        "processed": len(results),
        "elapsed_sec": round(time.time() - started, 3),
        "items": results,
    }
    with open(out_path, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"[shard {args.shard_index}/{args.shard_count}] "
          f"{len(results)}개 처리 → {out_path} "
          f"({payload['elapsed_sec']}s)")


if __name__ == "__main__":
    main()
