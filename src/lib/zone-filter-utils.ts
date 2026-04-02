import { getBatteryStatus } from "@/lib/dataTransform";
import type {
  NodeReading,
  Zone,
  ZoneFilterValue,
  ZoneSummary,
} from "@/types/zone";

/** Prefix for dashboard filter values that target one node: `node:{bareNodeId}` */
export const NODE_FILTER_PREFIX = "node:" as const;

export function isNodeFilterValue(v: ZoneFilterValue): boolean {
  return typeof v === "string" && v.startsWith(NODE_FILTER_PREFIX);
}

export function nodeIdFromZoneFilter(v: string): string | null {
  if (!v.startsWith(NODE_FILTER_PREFIX)) return null;
  const id = v.slice(NODE_FILTER_PREFIX.length).trim();
  return id || null;
}

export function toNodeFilterValue(nodeId: string): string {
  return `${NODE_FILTER_PREFIX}${nodeId}`;
}

export function findZoneContainingNode(
  zones: Zone[],
  nodeId: string
): Zone | undefined {
  return zones.find((z) => z.nodeIds.includes(nodeId));
}

/**
 * Node IDs included in the current dashboard filter (for charts, health counts, summaries).
 */
export function getFilteredNodeIds(
  zoneFilter: ZoneFilterValue,
  zones: Zone[],
  unassignedNodeIds: string[],
  allNodeReadings: Record<string, NodeReading>
): string[] {
  if (zoneFilter === "all") return Object.keys(allNodeReadings);
  if (zoneFilter === "unassigned") return [...unassignedNodeIds];
  if (isNodeFilterValue(zoneFilter)) {
    const nid = nodeIdFromZoneFilter(zoneFilter);
    return nid && allNodeReadings[nid] ? [nid] : [];
  }
  const z = zones.find((zo) => zo.id === zoneFilter);
  return z ? [...z.nodeIds] : [];
}

/**
 * One synthetic zone row for panels when filtering to a single node.
 */
export function buildSingleNodeZoneSummary(
  nodeId: string,
  reading: NodeReading,
  zones: Zone[],
  siteId: string
): ZoneSummary {
  const parent = findZoneContainingNode(zones, nodeId);
  const now = new Date().toISOString();
  return {
    id: nodeId,
    name: parent ? `${parent.name} · ${nodeId}` : nodeId,
    color: parent?.color ?? "#6366f1",
    siteId,
    nodeIds: [nodeId],
    createdAt: now,
    updatedAt: now,
    avgMoisture: reading.moisture,
    avgBattery: reading.batteryVoltage,
    avgBatteryStatus: getBatteryStatus(reading.batteryVoltage).status,
    avgSignal: reading.signal,
    status: reading.status,
    onlineNodeCount: reading.online ? 1 : 0,
    totalNodeCount: 1,
  };
}
