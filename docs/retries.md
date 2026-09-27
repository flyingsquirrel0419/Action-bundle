# Retries and resume

## Today (honest status)

GitHub Actions cannot rerun individual matrix jobs natively in a way that
preserves siblings, so Action-bundle does not pretend otherwise. What exists
now:

- `fail-fast: false` keeps surviving shards' results when one shard fails.
- The verifier names exactly which shards/tasks are missing
  (`MISSING_SHARDS`, `MISSING_TASKS` with ids in `error.details`).
- Deterministic partitioning means rerunning the same workload reproduces the
  same plan and the same `runId` — artifacts from the successful shards of
  the previous attempt remain valid.

## Manual retry recipe

1. Download `ab-manifests` and the surviving `shard-N` artifacts from the
   failed run.
2. Rerun the workflow with the same workload (same plan, same runId).
3. Take the rerun's artifacts for the shards that failed before, keep the
   surviving ones from the first attempt, and merge the directories. This
   works because an unchanged workload yields the same `runId` and the same
   `manifestDigest` per shard.
4. `action-bundle verify` over the merged directory proves coverage.

## Roadmap

- `action-bundle retry`: generate a rerun plan containing only failed shards.
- `action-bundle resume <run-id>`: reconstruct "planned / done / remaining"
  from manifests + result metadata and continue.

