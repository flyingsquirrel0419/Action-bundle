/** Structured error model for Action-bundle. */

export type ErrorCode =
  | "INVALID_CONFIG"
  | "PLANNING_ERROR"
  | "PARTITION_ERROR"
  | "MANIFEST_ERROR"
  | "COLLECTION_ERROR"
  | "MISSING_SHARDS"
  | "DUPLICATE_SHARDS"
  | "MISSING_TASKS"
  | "DUPLICATE_TASKS"
  | "MALFORMED_RESULT"
  | "INCOMPATIBLE_VERSION"
  | "UNEXPECTED_SHARD_COUNT"
  | "RUN_ID_MISMATCH"
  | "MANIFEST_DIGEST_MISMATCH"
  | "FAILED_SHARD"
  | "SHARD_ASSIGNMENT_MISMATCH"
  | "OVERSIZED_INPUT"
  | "REDUCTION_ERROR"
  | "WORKER_ERROR";

export class ActionBundleError extends Error {
  readonly code: ErrorCode;
  /** Machine-readable details, safe to log. */
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ActionBundleError";
    this.code = code;
    this.details = details;
  }
}

export class ConfigurationError extends ActionBundleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INVALID_CONFIG", message, details);
    this.name = "ConfigurationError";
  }
}

export class PlanningError extends ActionBundleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PLANNING_ERROR", message, details);
    this.name = "PlanningError";
  }
}

export class ManifestError extends ActionBundleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("MANIFEST_ERROR", message, details);
    this.name = "ManifestError";
  }
}

export class CollectionError extends ActionBundleError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "CollectionError";
  }
}

export class VerificationError extends ActionBundleError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "VerificationError";
  }
}

export class ReductionError extends ActionBundleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("REDUCTION_ERROR", message, details);
    this.name = "ReductionError";
  }
}
