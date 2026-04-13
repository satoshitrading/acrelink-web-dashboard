const DEPTH_LABEL_KEY_NUMERIC = /^\d+$/;
const DEPTH_LABEL_KEY_SOIL_RAW = /^soil_raw_\d+$/;

/**
 * Human-readable label for a depth index (`"0"`, `"1"`, …) from RTDB `depthLabels`.
 * Tries `soil_raw_{index}` first (matches firmware field names), then plain index.
 */
export function labelForDepthIndex(
  raw: Record<string, string> | undefined,
  depthIndex: string
): string | undefined {
  if (!raw) return undefined;
  const soilKey = `soil_raw_${depthIndex}`;
  const a = raw[soilKey];
  if (typeof a === "string" && a.trim()) return a.trim();
  const b = raw[depthIndex];
  if (typeof b === "string" && b.trim()) return b.trim();
  return undefined;
}

/**
 * Keep only valid depth label keys for writes (`"0"` or `soil_raw_0`, etc.).
 * Drops stray keys like `nodeId` that may exist in legacy documents.
 */
export function sanitizeDepthLabelsForWrite(
  input: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (
      !DEPTH_LABEL_KEY_NUMERIC.test(k) &&
      !DEPTH_LABEL_KEY_SOIL_RAW.test(k)
    ) {
      continue;
    }
    if (typeof v !== "string" || !v.trim()) continue;
    out[k] = v.trim();
  }
  return out;
}
