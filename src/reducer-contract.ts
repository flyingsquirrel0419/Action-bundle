import type { BuiltinReducer } from "./reduce.js";

/**
 * Single source of truth for what each reducer expects each shard to produce.
 * Used by the workflow/CLI to decide what to verify (--expect-output) and by
 * the reducer to know what to read. Do not duplicate this mapping.
 */
export const REDUCER_REQUIREMENTS: Record<
  BuiltinReducer,
  { type: "file"; name: string } | { type: "directory"; name: string } | null
> = {
  "json-array": { type: "file", name: "output.json" },
  "json-object": { type: "file", name: "output.json" },
  concat: { type: "file", name: "output.txt" },
  files: { type: "directory", name: "files" },
  none: null,
};

/**
 * The file/dir a shard must produce for verification under a given reducer.
 * Returns null for "none" and for custom reducers (which own their contract).
 */
export function expectedOutputFor(
  reducer: BuiltinReducer | "custom",
): string | null {
  if (reducer === "custom") return null;
  const req = REDUCER_REQUIREMENTS[reducer];
  return req === null ? null : req.name;
}
