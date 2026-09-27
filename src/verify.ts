import { VerificationError } from "./errors.js";
import { manifestDigest, type ShardManifest } from "./manifest.js";
import type { CollectedShard } from "./collector.js";

export interface VerificationReport {
  ok: boolean;
  shardCount: number;
  expectedTasks: number;
  verifiedTasks: number;
}

/**
 * Verify collected shard results against the planned manifests.
 *
 * Order: identity (run + manifest digest) -> status -> per-shard assignment
 * -> global coverage. Each result must be bound to its own manifest before
 * its task claims are trusted.
 *
 * This proves reported completeness and consistency, not Byzantine
 * correctness of arbitrary computation.
 */
export function verifyShards(opts: {
  manifests: ShardManifest[];
  collected: CollectedShard[];
  shardCount: number;
}): VerificationReport {
  const { manifests, collected, shardCount } = opts;

  // Cross-manifest consistency: all manifests agree on version/runId/shardCount,
  // and indices are exactly 0..shardCount-1.
  if (manifests.length !== shardCount) {
    throw new VerificationError(
      "UNEXPECTED_SHARD_COUNT",
      "expected " + shardCount + " manifests, got " + manifests.length,
    );
  }
  const runIds = new Set(manifests.map((m) => m.runId));
  const versions = new Set(manifests.map((m) => m.version));
  const shardCounts = new Set(manifests.map((m) => m.shardCount));
  if (runIds.size !== 1 || versions.size !== 1 || shardCounts.size !== 1) {
    throw new VerificationError(
      "MANIFEST_ERROR",
      "manifests disagree on version/runId/shardCount",
      { runIds: [...runIds], versions: [...versions], shardCounts: [...shardCounts] },
    );
  }
  const manifestByShard = new Map<number, ShardManifest>();
  for (const m of manifests) {
    if (manifestByShard.has(m.shardIndex)) {
      throw new VerificationError("DUPLICATE_SHARDS", "duplicate manifest for shard " + m.shardIndex);
    }
    manifestByShard.set(m.shardIndex, m);
  }
  for (let i = 0; i < shardCount; i++) {
    if (!manifestByShard.has(i)) {
      throw new VerificationError("MISSING_SHARDS", "missing manifest for shard " + i);
    }
  }
  const expectedRunId = manifests[0].runId;

  // Per-result checks: identity binding + status + per-shard assignment.
  const receivedIds = collected.map((c) => c.shard);
  if (new Set(receivedIds).size !== receivedIds.length) {
    const dupes = [...new Set(receivedIds.filter((id, i) => receivedIds.indexOf(id) !== i))];
    throw new VerificationError("DUPLICATE_SHARDS", "duplicate shard results: " + dupes.join(", "), { duplicates: dupes });
  }
  if (collected.length !== shardCount) {
    throw new VerificationError(
      "UNEXPECTED_SHARD_COUNT",
      "expected " + shardCount + " shard results, got " + collected.length,
      { expected: shardCount, got: collected.length },
    );
  }

  const expectedTasksGlobal = new Set<string>();
  for (const m of manifests) for (const t of m.tasks) expectedTasksGlobal.add(t.id);
  const completedGlobal = new Set<string>();

  for (const c of collected) {
    const m = manifestByShard.get(c.shard);
    if (!m) {
      throw new VerificationError("MISSING_SHARDS", "no manifest for reported shard " + c.shard);
    }
    // Identity: result must be bound to this exact run and manifest.
    if (c.meta.runId !== expectedRunId) {
      throw new VerificationError(
        "RUN_ID_MISMATCH",
        "shard " + c.shard + " result bound to run " + c.meta.runId + ", expected " + expectedRunId,
        { shard: c.shard, got: c.meta.runId, expected: expectedRunId },
      );
    }
    const expectedDigest = manifestDigest(m);
    if (c.meta.manifestDigest !== expectedDigest) {
      throw new VerificationError(
        "MANIFEST_DIGEST_MISMATCH",
        "shard " + c.shard + " result bound to a different manifest",
        { shard: c.shard },
      );
    }
    // Status: a failed shard can never pass verification.
    if (c.meta.status !== "success") {
      throw new VerificationError(
        "FAILED_SHARD",
        "shard " + c.shard + " reported status " + c.meta.status,
        { shard: c.shard, error: c.meta.error },
      );
    }
    // taskCount must agree with the manifest it is bound to.
    if (c.meta.taskCount !== m.tasks.length) {
      throw new VerificationError(
        "MALFORMED_RESULT",
        "shard " + c.shard + " reported taskCount " + c.meta.taskCount +
          " but its manifest has " + m.tasks.length + " tasks",
        { shard: c.shard, reported: c.meta.taskCount, planned: m.tasks.length },
      );
    }
    // Per-shard assignment: reported completions must be exactly this shard's
    // planned tasks — not another shard's, and not the global set.
    const planned = new Set(m.tasks.map((t) => t.id));
    const reported = c.meta.completedTaskIds;
    const notMine = reported.filter((id) => !planned.has(id));
    if (notMine.length > 0) {
      throw new VerificationError(
        "SHARD_ASSIGNMENT_MISMATCH",
        "shard " + c.shard + " reported tasks not in its manifest: " + notMine.slice(0, 10).join(", "),
        { shard: c.shard, notMine: notMine.slice(0, 20) },
      );
    }
    const reportedSet = new Set(reported);
    const notDone = [...planned].filter((id) => !reportedSet.has(id));
    if (notDone.length > 0) {
      throw new VerificationError(
        "MISSING_TASKS",
        "shard " + c.shard + " did not report " + notDone.length + " of its planned tasks",
        { shard: c.shard, missing: notDone.slice(0, 20), totalMissing: notDone.length },
      );
    }
    for (const id of reported) completedGlobal.add(id);
  }

  // Global coverage as defense in depth.
  const missingGlobal = [...expectedTasksGlobal].filter((id) => !completedGlobal.has(id));
  if (missingGlobal.length > 0) {
    const err = new VerificationError(
      "MISSING_TASKS",
      "global coverage mismatch: " + missingGlobal.length + " tasks not reported complete",
      { missing: missingGlobal.slice(0, 20), totalMissing: missingGlobal.length },
    );
    err.name = "ActionBundleVerificationError";
    throw err;
  }

  return {
    ok: true,
    shardCount,
    expectedTasks: expectedTasksGlobal.size,
    verifiedTasks: completedGlobal.size,
  };
}
