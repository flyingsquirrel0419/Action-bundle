#!/usr/bin/env python3
"""Python worker example for Action-bundle.

Reads the shard manifest from ACTION_BUNDLE_MANIFEST, processes each task,
and writes output.json into ACTION_BUNDLE_OUTPUT_DIR for the reducer.
"""
import json
import os
import hashlib


def main() -> None:
    manifest_path = os.environ["ACTION_BUNDLE_MANIFEST"]
    out_dir = os.environ["ACTION_BUNDLE_OUTPUT_DIR"]
    shard = os.environ["ACTION_BUNDLE_SHARD_INDEX"]

    with open(manifest_path) as f:
        manifest = json.load(f)

    results = []
    for task in manifest["tasks"]:
        digest = hashlib.sha256(task["id"].encode()).hexdigest()[:16]
        results.append({"id": task["id"], "digest": digest})

    out_path = os.path.join(out_dir, "output.json")
    with open(out_path, "w") as f:
        json.dump(results, f)
    print(f"[python-worker] shard {shard}: {len(results)} tasks -> {out_path}")


if __name__ == "__main__":
    main()

