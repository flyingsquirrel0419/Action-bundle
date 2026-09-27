// Public API — small primitives, strict types, no internal leaks.
export {
  ActionBundleError,
  CollectionError,
  ConfigurationError,
  ManifestError,
  PlanningError,
  ReductionError,
  VerificationError,
} from "./errors.js";
export type { ErrorCode } from "./errors.js";

export type { Task, Workload } from "./task.js";
export { workloadToTasks } from "./task.js";

export { partition, shardOf } from "./partition.js";

export {
  MANIFEST_VERSION,
  canonicalize,
  createManifest,
  manifestDigest,
  parseManifest,
  runIdFor,
} from "./manifest.js";
export type { ShardManifest } from "./manifest.js";

export { createPlan } from "./planner.js";
export type { Plan, PlanOptions } from "./planner.js";

export { WORKER_ENV, WorkerError, digestRounds, runWorker } from "./worker.js";
export type { ShardResultMeta, WorkerRunOptions } from "./worker.js";

export { collectFromDir } from "./collector.js";
export type { CollectedShard } from "./collector.js";

export { verifyShards } from "./verify.js";
export type { VerificationReport } from "./verify.js";

export { reduceResults } from "./reduce.js";
export type { BuiltinReducer, ReduceOptions } from "./reduce.js";

export { REDUCER_REQUIREMENTS, expectedOutputFor } from "./reducer-contract.js";
