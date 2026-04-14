import type { NodeReading } from "@/types/zone";
import { ZONE_AVERAGE_DATA_KEY } from "@/lib/zone-moisture-aggregate";

/** Delimiter for chart series keys: `entityId|depthKey` */
export const MOISTURE_DEPTH_SERIES_DELIM = "|" as const;

export function buildSeriesKey(entityId: string, depthKey: string): string {
  return `${entityId}${MOISTURE_DEPTH_SERIES_DELIM}${depthKey}`;
}

export function parseSeriesKey(key: string): {
  entityId: string;
  depthKey: string;
} | null {
  const i = key.indexOf(MOISTURE_DEPTH_SERIES_DELIM);
  if (i <= 0 || i >= key.length - 1) return null;
  return {
    entityId: key.slice(0, i),
    depthKey: key.slice(i + MOISTURE_DEPTH_SERIES_DELIM.length),
  };
}

export function sortDepthKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => Number(a) - Number(b));
}

/**
 * Union of depth indices seen in live readings or merged history for the given nodes.
 */
export function collectDepthKeysForNodes(
  nodeIds: string[],
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  liveReadings: Record<string, NodeReading>
): string[] {
  const depths = new Set<string>();
  for (const nid of nodeIds) {
    const r = liveReadings[nid];
    if (r?.online && r.moistureByDepth) {
      for (const d of Object.keys(r.moistureByDepth)) depths.add(d);
    }
    for (const dateKey of Object.keys(mergedByDepth)) {
      const byNode = mergedByDepth[dateKey]?.[nid];
      if (!byNode) continue;
      for (const d of Object.keys(byNode)) depths.add(d);
    }
  }
  return sortDepthKeys([...depths]);
}

export function buildDepthSeriesKeysForZone(
  zoneNodeIds: string[],
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  liveReadings: Record<string, NodeReading>
): string[] {
  const depths = collectDepthKeysForNodes(
    zoneNodeIds,
    mergedByDepth,
    liveReadings
  );
  return depths.map((d) => buildSeriesKey(ZONE_AVERAGE_DATA_KEY, d));
}

export function buildDepthSeriesKeysForNode(
  nodeId: string,
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  liveReadings: Record<string, NodeReading>
): string[] {
  const depths = collectDepthKeysForNodes(
    [nodeId],
    mergedByDepth,
    liveReadings
  );
  return depths.map((d) => buildSeriesKey(nodeId, d));
}

/**
 * All `nodeId|depth` series for every node in the zone (e.g. whole-zone forecast: one line per node per depth).
 */
export function buildDepthSeriesKeysForZoneAllNodes(
  zoneNodeIds: string[],
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  liveReadings: Record<string, NodeReading>
): string[] {
  const keys: string[] = [];
  for (const nid of zoneNodeIds) {
    keys.push(
      ...buildDepthSeriesKeysForNode(nid, mergedByDepth, liveReadings)
    );
  }
  return keys;
}

/**
 * Merge per-node depth histories for every node in the zone into one chart history object.
 */
export function buildDepthChartHistoryZoneAllNodes(
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  zoneNodeIds: string[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const nid of zoneNodeIds) {
    const one = buildDepthChartHistorySingleNode(mergedByDepth, nid);
    for (const [dateKey, row] of Object.entries(one)) {
      if (!result[dateKey]) result[dateKey] = {};
      Object.assign(result[dateKey], row);
    }
  }
  return result;
}

/**
 * Per-date rows keyed by `buildSeriesKey(ZONE_AVERAGE_DATA_KEY, depth)` from zone node averages.
 */
export function buildDepthChartHistoryZoneAverage(
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  zoneNodeIds: string[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  if (!zoneNodeIds.length) return result;

  for (const dateKey of Object.keys(mergedByDepth)) {
    const byNode = mergedByDepth[dateKey];
    const depthToVals: Record<string, number[]> = {};

    for (const nid of zoneNodeIds) {
      const nodeDepths = byNode[nid];
      if (!nodeDepths) continue;
      for (const [d, v] of Object.entries(nodeDepths)) {
        if (v == null || Number.isNaN(Number(v))) continue;
        if (!depthToVals[d]) depthToVals[d] = [];
        depthToVals[d].push(v);
      }
    }

    if (Object.keys(depthToVals).length === 0) continue;
    result[dateKey] = {};
    for (const [d, vals] of Object.entries(depthToVals)) {
      const avg =
        vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
      result[dateKey][buildSeriesKey(ZONE_AVERAGE_DATA_KEY, d)] =
        Math.round(avg * 10) / 10;
    }
  }

  return result;
}

/**
 * Per-date rows keyed by `buildSeriesKey(nodeId, depth)` for one node.
 */
export function buildDepthChartHistorySingleNode(
  mergedByDepth: Record<string, Record<string, Record<string, number>>>,
  nodeId: string
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const dateKey of Object.keys(mergedByDepth)) {
    const nodeDepths = mergedByDepth[dateKey]?.[nodeId];
    if (!nodeDepths || Object.keys(nodeDepths).length === 0) continue;
    result[dateKey] = {};
    for (const [d, v] of Object.entries(nodeDepths)) {
      if (v == null || Number.isNaN(Number(v))) continue;
      result[dateKey][buildSeriesKey(nodeId, d)] = Math.round(v * 10) / 10;
    }
  }

  return result;
}
