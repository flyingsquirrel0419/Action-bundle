#!/usr/bin/env bash
# Shell worker example for Action-bundle: produce a line per task using jq.
set -euo pipefail

: "${ACTION_BUNDLE_MANIFEST:?}"
: "${ACTION_BUNDLE_OUTPUT_DIR:?}"

jq -c '.tasks[] | {id: .id}' "$ACTION_BUNDLE_MANIFEST" > "$ACTION_BUNDLE_OUTPUT_DIR/output.txt"
if [ -n "${ACTION_BUNDLE_COMPLETIONS:-}" ]; then
  jq '{completedTaskIds: [.tasks[].id]}' "$ACTION_BUNDLE_MANIFEST" > "$ACTION_BUNDLE_COMPLETIONS"
fi
echo "[shell-worker] shard ${ACTION_BUNDLE_SHARD_INDEX}: $(wc -l < "$ACTION_BUNDLE_OUTPUT_DIR/output.txt") tasks"
