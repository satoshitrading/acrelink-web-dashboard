/**
 * Shared aggregation layer — single place for node-level readings and history.
 * All dashboard views should consume data produced here (via hooks), not duplicate RTDB walks.
 */

import { database } from "@/lib/firebase";
import {
  getBatteryStatus,
  getMoisturePercent,
  getMoistureStatus,
  getSignalPercent,
} from "@/lib/dataTransform";
import type { NodeReading, Zone, ZoneSummary } from "@/types/zone";
import { ref, onValue, get, Unsubscribe } from "firebase/database";

export type AggregatedSnapshot = {
  allNodeReadings: Record<string, NodeReading>;
  /** dateKey (YYYY-MM-DD) -> nodeId -> average moisture % that day */
  dailyHistoryByNode: Record<string, Record<string, number>>;
  siteLatestDateKey: string | null;
  totalNodeCount: number;
  onlineNodeCount: number;
};

function parsePacketsFromNode(
  node: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  let packets = node;
  if (node.packets && typeof node.packets === "object") {
    packets = node.packets as Record<string, unknown>;
  }
  return packets as Record<string, Record<string, unknown>>;
}

/**
 * Walk gateways snapshot and compute site-wide latest date key + per-node latest date.
 */
function computeSiteAndNodeLatestDates(
  gatewaysData: Record<string, unknown>,
  realToday: string
): {
  siteLatestDateKey: string | null;
  nodeLatestDateMap: Record<string, Record<string, string | null>>;
} {
  const nodeLatestDateMap: Record<string, Record<string, string | null>> = {};
  let siteLatestDateKey: string | null = null;

  for (const gatewayId in gatewaysData) {
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":"))
      continue;
    const gateway = gatewaysData[gatewayId] as Record<string, unknown>;
    if (!gateway || typeof gateway !== "object") continue;

    nodeLatestDateMap[gatewayId] = {};

    for (const nodeKey in gateway) {
      if (!nodeKey.startsWith("nodeId:")) continue;

      let nodeLatestDateKey: string | null = null;
      const node = gateway[nodeKey] as Record<string, unknown>;
      const packets = parsePacketsFromNode(node);

      for (const packetId in packets) {
        const rawData = packets[packetId];
        if (!rawData?.timestamp) continue;
        const dateKey = String(rawData.timestamp).split("T")[0];
        if (dateKey > realToday) continue;

        if (!siteLatestDateKey || dateKey > siteLatestDateKey) {
          siteLatestDateKey = dateKey;
        }
        if (!nodeLatestDateKey || dateKey > nodeLatestDateKey) {
          nodeLatestDateKey = dateKey;
        }
      }

      nodeLatestDateMap[gatewayId][nodeKey] = nodeLatestDateKey;
    }
  }

  return { siteLatestDateKey, nodeLatestDateMap };
}

function buildLatestReadingForNode(
  gatewayId: string,
  nodeKey: string,
  node: Record<string, unknown>,
  realToday: string,
  siteLatestDateKey: string | null,
  nodeLatestDateKey: string | null
): NodeReading | null {
  const bareId = nodeKey.replace(/^nodeId:/, "");
  const packets = parsePacketsFromNode(node);

  let latestPacket: NodeReading | null = null;
  let latestTimestamp = 0;

  for (const packetId in packets) {
    const rawData = packets[packetId];
    if (!rawData?.timestamp) continue;
    const dateKey = String(rawData.timestamp).split("T")[0];
    if (dateKey > realToday) continue;

    const soilRaw = Number(rawData.soil_raw);
    const batteryV = Number(rawData.battery_v);
    const rssi = Number(rawData.rssi);

    const moisture = getMoisturePercent(soilRaw);
    const batteryInfo = getBatteryStatus(batteryV);
    const signal = getSignalPercent(rssi);
    const statusInfo = getMoistureStatus(moisture);

    const ts = new Date(String(rawData.timestamp)).getTime();
    if (ts > latestTimestamp) {
      latestTimestamp = ts;
      latestPacket = {
        nodeId: bareId,
        gatewayId,
        moisture,
        batteryVoltage: batteryV,
        batteryStatus: batteryInfo.status,
        signal,
        status: statusInfo.status,
        timestamp: String(rawData.timestamp),
        soil_raw: soilRaw,
        rssi,
        online:
          !!nodeLatestDateKey &&
          !!siteLatestDateKey &&
          nodeLatestDateKey === siteLatestDateKey,
      };
    }
  }

  return latestPacket;
}

/**
 * Build per-node daily average moisture from gateways snapshot (same rules as legacy Dashboard).
 */
function buildDailyHistoryByNode(
  gatewaysData: Record<string, unknown>,
  realToday: string,
  nodeLatestDateMap: Record<string, Record<string, string | null>>,
  siteLatestDateKey: string | null
): Record<string, Record<string, number[]>> {
  const historicalDaily: Record<string, Record<string, number[]>> = {};

  for (const gatewayId in gatewaysData) {
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":"))
      continue;
    const gateway = gatewaysData[gatewayId] as Record<string, unknown>;
    if (!gateway || typeof gateway !== "object") continue;

    for (const nodeKey in gateway) {
      if (!nodeKey.startsWith("nodeId:")) continue;

      const nodeLatest = nodeLatestDateMap[gatewayId]?.[nodeKey];
      const isOnline =
        !!nodeLatest &&
        !!siteLatestDateKey &&
        nodeLatest === siteLatestDateKey;
      if (!isOnline) continue;

      const bareId = nodeKey.replace(/^nodeId:/, "");
      const node = gateway[nodeKey] as Record<string, unknown>;
      const packets = parsePacketsFromNode(node);

      for (const packetId in packets) {
        const rawData = packets[packetId];
        if (!rawData?.timestamp) continue;
        const dateKey = String(rawData.timestamp).split("T")[0];
        if (dateKey > realToday) continue;

        if (!historicalDaily[dateKey]) historicalDaily[dateKey] = {};
        if (!historicalDaily[dateKey][bareId]) {
          historicalDaily[dateKey][bareId] = [];
        }
        const moisture = getMoisturePercent(Number(rawData.soil_raw));
        historicalDaily[dateKey][bareId].push(moisture);
      }
    }
  }

  const dailyAverages: Record<string, Record<string, number>> = {};
  for (const dateKey in historicalDaily) {
    dailyAverages[dateKey] = {};
    for (const nodeId in historicalDaily[dateKey]) {
      const readings = historicalDaily[dateKey][nodeId];
      const avg =
        readings.reduce((a, b) => a + b, 0) / Math.max(1, readings.length);
      dailyAverages[dateKey][nodeId] = Math.round(avg * 10) / 10;
    }
  }

  return dailyAverages;
}

function processGatewaysSnapshot(
  gatewaysData: Record<string, unknown> | null
): AggregatedSnapshot {
  const realToday = new Date().toISOString().split("T")[0];
  const empty: AggregatedSnapshot = {
    allNodeReadings: {},
    dailyHistoryByNode: {},
    siteLatestDateKey: null,
    totalNodeCount: 0,
    onlineNodeCount: 0,
  };

  if (!gatewaysData) return empty;

  const { siteLatestDateKey, nodeLatestDateMap } =
    computeSiteAndNodeLatestDates(gatewaysData, realToday);

  let totalNodeCount = 0;
  let onlineNodeCount = 0;
  const allNodeReadings: Record<string, NodeReading> = {};

  for (const gatewayId in gatewaysData) {
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":"))
      continue;
    const gateway = gatewaysData[gatewayId] as Record<string, unknown>;
    if (!gateway || typeof gateway !== "object") continue;

    for (const nodeKey in gateway) {
      if (!nodeKey.startsWith("nodeId:")) continue;
      totalNodeCount++;

      const nodeLatest = nodeLatestDateMap[gatewayId]?.[nodeKey];
      const isOnline =
        !!nodeLatest &&
        !!siteLatestDateKey &&
        nodeLatest === siteLatestDateKey;
      if (isOnline) onlineNodeCount++;

      const node = gateway[nodeKey] as Record<string, unknown>;
      const reading = buildLatestReadingForNode(
        gatewayId,
        nodeKey,
        node,
        realToday,
        siteLatestDateKey,
        nodeLatest
      );
      if (reading) {
        const bareId = nodeKey.replace(/^nodeId:/, "");
        allNodeReadings[bareId] = reading;
      }
    }
  }

  const dailyHistoryByNode = buildDailyHistoryByNode(
    gatewaysData,
    realToday,
    nodeLatestDateMap,
    siteLatestDateKey
  );

  return {
    allNodeReadings,
    dailyHistoryByNode,
    siteLatestDateKey,
    totalNodeCount,
    onlineNodeCount,
  };
}

/**
 * Subscribe to all node readings + derived daily history for a site.
 */
export function subscribeToSiteAggregation(
  siteIdParam: string,
  callback: (data: AggregatedSnapshot) => void
): Unsubscribe {
  const siteKey = siteIdParam.startsWith("siteId:")
    ? siteIdParam
    : `siteId:${siteIdParam}`;
  const pathRef = ref(database, `sensor-readings/${siteKey}/gateways`);

  return onValue(
    pathRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback({
          allNodeReadings: {},
          dailyHistoryByNode: {},
          siteLatestDateKey: null,
          totalNodeCount: 0,
          onlineNodeCount: 0,
        });
        return;
      }
      const raw = snapshot.val() as Record<string, unknown>;
      callback(processGatewaysSnapshot(raw));
    },
    (err) => {
      console.error("subscribeToSiteAggregation:", err);
      callback({
        allNodeReadings: {},
        dailyHistoryByNode: {},
        siteLatestDateKey: null,
        totalNodeCount: 0,
        onlineNodeCount: 0,
      });
    }
  );
}

/**
 * One-shot fetch (e.g. tests) — same shape as subscription callback.
 */
export async function fetchSiteAggregation(
  siteIdParam: string
): Promise<AggregatedSnapshot> {
  const siteKey = siteIdParam.startsWith("siteId:")
    ? siteIdParam
    : `siteId:${siteIdParam}`;
  const snapshot = await get(
    ref(database, `sensor-readings/${siteKey}/gateways`)
  );
  if (!snapshot.exists()) {
    return {
      allNodeReadings: {},
      dailyHistoryByNode: {},
      siteLatestDateKey: null,
      totalNodeCount: 0,
      onlineNodeCount: 0,
    };
  }
  return processGatewaysSnapshot(snapshot.val() as Record<string, unknown>);
}

export function getReadingsForNodes(
  nodeIds: string[],
  allReadings: Record<string, NodeReading>
): Record<string, NodeReading> {
  const out: Record<string, NodeReading> = {};
  for (const id of nodeIds) {
    if (allReadings[id]) out[id] = allReadings[id];
  }
  return out;
}

/**
 * Zone status from average moisture of **online** nodes in the zone; if none online, average all with readings.
 */
export function computeZoneSummaries(
  zones: Zone[],
  allReadings: Record<string, NodeReading>
): ZoneSummary[] {
  return zones.map((z) => {
    const readings = z.nodeIds
      .map((id) => allReadings[id])
      .filter(Boolean) as NodeReading[];

    const onlineReadings = readings.filter((r) => r.online);
    const pool = onlineReadings.length > 0 ? onlineReadings : readings;

    let avgMoisture = 0;
    let avgBattery = 0;
    let avgSignal = 0;
    let status = "Optimal";

    if (pool.length > 0) {
      avgMoisture = Math.round(
        pool.reduce((a, r) => a + r.moisture, 0) / pool.length
      );
      avgBattery =
        Math.round(
          (pool.reduce((a, r) => a + r.batteryVoltage, 0) / pool.length) *
            100
        ) / 100;
      avgSignal = Math.round(
        pool.reduce((a, r) => a + r.signal, 0) / pool.length
      );
      status = getMoistureStatus(avgMoisture).status;
    }

    const avgBatteryStatus = getBatteryStatus(avgBattery).status;

    return {
      ...z,
      avgMoisture,
      avgBattery,
      avgBatteryStatus,
      avgSignal,
      status,
      onlineNodeCount: onlineReadings.length,
      totalNodeCount: z.nodeIds.length,
    };
  });
}

/**
 * Daily average moisture per zone for chart rows: dateKey -> zoneId -> avg
 */
/** Alias per milestone naming — same as `subscribeToSiteAggregation`. */
export const subscribeToAllNodeReadings = subscribeToSiteAggregation;

/**
 * Pure helper: historical daily averages per node from a gateways object (e.g. snapshot.val()).
 */
export function buildHistoricalDataByNode(
  gatewaysData: Record<string, unknown> | null
): Record<string, Record<string, number>> {
  return processGatewaysSnapshot(gatewaysData).dailyHistoryByNode;
}

export function buildDailyHistoryByZone(
  zones: Zone[],
  dailyHistoryByNode: Record<string, Record<string, number>>
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const dateKey in dailyHistoryByNode) {
    const byNode = dailyHistoryByNode[dateKey];
    result[dateKey] = {};

    for (const z of zones) {
      const vals: number[] = [];
      for (const nid of z.nodeIds) {
        if (byNode[nid] != null) vals.push(byNode[nid]);
      }
      if (vals.length > 0) {
        result[dateKey][z.id] =
          Math.round(
            (vals.reduce((a, b) => a + b, 0) / vals.length) * 10
          ) / 10;
      }
    }
  }

  return result;
}
