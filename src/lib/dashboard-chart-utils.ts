import { buildDailyHistoryByZone } from "@/services/aggregationService";
import {
  isNodeFilterValue,
  nodeIdFromZoneFilter,
} from "@/lib/zone-filter-utils";
import type { Zone, ZoneFilterValue } from "@/types/zone";

/**
 * Merge historical per-node daily averages with today's live readings.
 */
export function mergeDailyHistoryWithToday(
  dailyHistoryByNode: Record<string, Record<string, number>>,
  todayKey: string,
  liveMoistureByNode: Record<string, number>
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [dk, row] of Object.entries(dailyHistoryByNode)) {
    out[dk] = { ...row };
  }
  if (!out[todayKey]) out[todayKey] = {};
  for (const [nid, m] of Object.entries(liveMoistureByNode)) {
    out[todayKey][nid] = m;
  }
  return out;
}

/**
 * Merge historical per-node per-depth daily averages with today's live `moistureByDepth`.
 */
export function mergeDailyHistoryByDepthWithToday(
  dailyHistoryByDepth: Record<string, Record<string, Record<string, number>>>,
  todayKey: string,
  liveMoistureByDepthByNode: Record<string, Record<string, number>>
): Record<string, Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, Record<string, number>>> = {};
  for (const [dk, byNode] of Object.entries(dailyHistoryByDepth)) {
    out[dk] = {};
    for (const [nid, depths] of Object.entries(byNode)) {
      out[dk][nid] = { ...depths };
    }
  }
  if (!out[todayKey]) out[todayKey] = {};
  for (const [nid, byDepth] of Object.entries(liveMoistureByDepthByNode)) {
    if (!out[todayKey][nid]) out[todayKey][nid] = {};
    for (const [d, v] of Object.entries(byDepth)) {
      out[todayKey][nid][d] = v;
    }
  }
  return out;
}

export function buildChartHistory(
  zoneFilter: ZoneFilterValue,
  zones: Zone[],
  mergedByNode: Record<string, Record<string, number>>,
  unassignedNodeIds: string[]
): Record<string, Record<string, number>> {
  if (zoneFilter === "all") {
    return buildDailyHistoryByZone(zones, mergedByNode);
  }

  if (zoneFilter === "unassigned") {
    const out: Record<string, Record<string, number>> = {};
    for (const dk of Object.keys(mergedByNode)) {
      out[dk] = {};
      for (const nid of unassignedNodeIds) {
        const v = mergedByNode[dk]?.[nid];
        if (v != null) out[dk][nid] = v;
      }
    }
    return out;
  }

  if (isNodeFilterValue(zoneFilter)) {
    const nid = nodeIdFromZoneFilter(zoneFilter);
    if (!nid) return {};
    const out: Record<string, Record<string, number>> = {};
    for (const dk of Object.keys(mergedByNode)) {
      out[dk] = {};
      const v = mergedByNode[dk]?.[nid];
      if (v != null) out[dk][nid] = v;
    }
    return out;
  }

  const z = zones.find((zo) => zo.id === zoneFilter);
  if (!z) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const dk of Object.keys(mergedByNode)) {
    out[dk] = {};
    for (const nid of z.nodeIds) {
      const v = mergedByNode[dk]?.[nid];
      if (v != null) out[dk][nid] = v;
    }
  }
  return out;
}

export function getChartSeriesKeys(
  zoneFilter: ZoneFilterValue,
  zones: Zone[],
  unassignedNodeIds: string[]
): string[] {
  if (zoneFilter === "all") return zones.map((z) => z.id);
  if (zoneFilter === "unassigned") return [...unassignedNodeIds];
  if (isNodeFilterValue(zoneFilter)) {
    const nid = nodeIdFromZoneFilter(zoneFilter);
    return nid ? [nid] : [];
  }
  const z = zones.find((zo) => zo.id === zoneFilter);
  return z ? [...z.nodeIds] : [];
}
