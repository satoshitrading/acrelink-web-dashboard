/**
 * Reusable zone-level daily moisture aggregation (e.g. whole-zone chart, future drying curve).
 * For each calendar date, averages moisture across zone nodes that have a value that day.
 */

/** Synthetic data key for a single zone-average series in chart history (avoids colliding with node ids). */
export const ZONE_AVERAGE_DATA_KEY = "__zoneAvg__";

export function buildZoneAverageDailySeries(
  mergedByNode: Record<string, Record<string, number>>,
  zoneNodeIds: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!zoneNodeIds.length) return out;

  for (const dateKey of Object.keys(mergedByNode)) {
    const row = mergedByNode[dateKey];
    const values: number[] = [];
    for (const nid of zoneNodeIds) {
      const v = row?.[nid];
      if (v != null && !Number.isNaN(v)) values.push(v);
    }
    if (values.length > 0) {
      const avg =
        values.reduce((a, b) => a + b, 0) / values.length;
      out[dateKey] = Math.round(avg * 10) / 10;
    }
  }
  return out;
}
