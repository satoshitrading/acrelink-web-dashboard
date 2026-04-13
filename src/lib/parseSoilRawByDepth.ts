const SOIL_RAW_DEPTH_RE = /^soil_raw_(\d+)$/;

/**
 * Extract per-depth soil ADC values from a packet.
 * - Collects numeric `soil_raw_N` fields; keys are depth indices `"0"`, `"1"`, …
 * - If `soil_raw_0` is absent and bare `soil_raw` is present, maps legacy single-depth to `"0"`.
 * - If both bare `soil_raw` and `soil_raw_0` exist, `soil_raw_0` wins for index `0` (no double-count).
 */
export function parseSoilRawByDepth(
  rawData: Record<string, unknown>
): Record<string, number> {
  const out: Record<string, number> = {};
  let hasIndexed0 = false;

  for (const key of Object.keys(rawData)) {
    const m = key.match(SOIL_RAW_DEPTH_RE);
    if (!m) continue;
    const depthKey = m[1];
    const n = Number(rawData[key]);
    if (!Number.isFinite(n)) continue;
    out[depthKey] = n;
    if (depthKey === "0") hasIndexed0 = true;
  }

  if (!hasIndexed0 && rawData.soil_raw != null) {
    const n = Number(rawData.soil_raw);
    if (Number.isFinite(n)) out["0"] = n;
  }

  return out;
}
