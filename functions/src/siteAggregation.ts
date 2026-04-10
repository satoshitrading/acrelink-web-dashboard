/**
 * Keep in sync with src/services/aggregationService.ts and src/lib/dataTransform.ts
 * (server-side evaluation for alerts; no Firebase client SDK).
 * VWC + status math: ./sensorRequirementMath.ts
 */

import {
  getBatteryStatus,
  getMoisturePercent,
  getMoistureStatus,
} from "./sensorRequirementMath";

export type NodeReading = {
  nodeId: string;
  gatewayId: string;
  moisture: number;
  batteryVoltage: number;
  batteryStatus: string;
  packetReceptionPercent: number;
  signal: number;
  status: string;
  timestamp: string;
  soil_raw: number;
  rssi: number;
  online: boolean;
};

export type Zone = {
  id: string;
  name: string;
  color: string;
  siteId: string;
  nodeIds: string[];
  createdAt: string;
  updatedAt: string;
  moistureThresholdVwc?: number | null;
};

export type ZoneSummary = Zone & {
  avgMoisture: number;
  avgBattery: number;
  avgBatteryStatus: string;
  avgSignal: number;
  status: string;
  onlineNodeCount: number;
  totalNodeCount: number;
};

export const EXPECTED_PACKETS_7D = 84;

function packetReceptionPercentFromCount(received: number): number {
  if (received <= 0) return 0;
  const pct = (received / EXPECTED_PACKETS_7D) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

function countPacketsReceivedInLast7Days(
  packets: Record<string, Record<string, unknown>>,
  realToday: string
): number {
  const nowMs = Date.now();
  const windowStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const packetId in packets) {
    const rawData = packets[packetId];
    if (!rawData?.timestamp) continue;
    const dateKey = String(rawData.timestamp).split("T")[0];
    if (dateKey > realToday) continue;
    const ts = new Date(String(rawData.timestamp)).getTime();
    if (Number.isNaN(ts) || ts <= windowStartMs || ts > nowMs) continue;
    n++;
  }
  return n;
}

function extractPacketSequence(
  packetKey: string,
  rawData: Record<string, unknown>
): number | null {
  const fromPayload = Number(rawData.packetId);
  if (Number.isFinite(fromPayload) && fromPayload >= 0) {
    return Math.trunc(fromPayload);
  }
  const rawKey = packetKey.startsWith("packetId:")
    ? packetKey.slice("packetId:".length)
    : packetKey;
  const fromKey = Number(rawKey);
  if (Number.isFinite(fromKey) && fromKey >= 0) {
    return Math.trunc(fromKey);
  }
  return null;
}

function packetReceptionPercentLast7Days(
  packets: Record<string, Record<string, unknown>>,
  realToday: string
): number {
  const nowMs = Date.now();
  const windowStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const sequenceIds = new Set<number>();

  for (const packetId in packets) {
    const rawData = packets[packetId];
    if (!rawData?.timestamp) continue;
    const dateKey = String(rawData.timestamp).split("T")[0];
    if (dateKey > realToday) continue;
    const ts = new Date(String(rawData.timestamp)).getTime();
    if (Number.isNaN(ts) || ts <= windowStartMs || ts > nowMs) continue;
    const seq = extractPacketSequence(packetId, rawData);
    if (seq != null) sequenceIds.add(seq);
  }

  if (sequenceIds.size >= 2) {
    const seqArr = Array.from(sequenceIds);
    const minId = Math.min(...seqArr);
    const maxId = Math.max(...seqArr);
    const expectedBySpan = maxId - minId + 1;
    if (expectedBySpan >= sequenceIds.size && expectedBySpan > 0) {
      const pct = (sequenceIds.size / expectedBySpan) * 100;
      return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
    }
  }

  const received = countPacketsReceivedInLast7Days(packets, realToday);
  return packetReceptionPercentFromCount(received);
}

function parsePacketsFromNode(
  node: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  let packets = node;
  if (node.packets && typeof node.packets === "object") {
    packets = node.packets as Record<string, unknown>;
  }
  return packets as Record<string, Record<string, unknown>>;
}

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
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":")) continue;
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

  const packetReceptionPercent = packetReceptionPercentLast7Days(packets, realToday);
  const signal = packetReceptionPercent;

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
        packetReceptionPercent,
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

function buildDailyHistoryByNode(
  gatewaysData: Record<string, unknown>,
  realToday: string,
  nodeLatestDateMap: Record<string, Record<string, string | null>>,
  siteLatestDateKey: string | null
): Record<string, Record<string, number>> {
  const historicalDaily: Record<string, Record<string, number[]>> = {};

  for (const gatewayId in gatewaysData) {
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":")) continue;
    const gateway = gatewaysData[gatewayId] as Record<string, unknown>;
    if (!gateway || typeof gateway !== "object") continue;

    for (const nodeKey in gateway) {
      if (!nodeKey.startsWith("nodeId:")) continue;

      const nodeLatest = nodeLatestDateMap[gatewayId]?.[nodeKey];
      const isOnline =
        !!nodeLatest && !!siteLatestDateKey && nodeLatest === siteLatestDateKey;
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

export type AggregatedSnapshot = {
  allNodeReadings: Record<string, NodeReading>;
  dailyHistoryByNode: Record<string, Record<string, number>>;
  siteLatestDateKey: string | null;
  totalNodeCount: number;
  onlineNodeCount: number;
};

export function processGatewaysSnapshot(
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
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":")) continue;
    const gateway = gatewaysData[gatewayId] as Record<string, unknown>;
    if (!gateway || typeof gateway !== "object") continue;

    for (const nodeKey in gateway) {
      if (!nodeKey.startsWith("nodeId:")) continue;
      totalNodeCount++;

      const nodeLatest = nodeLatestDateMap[gatewayId]?.[nodeKey];
      const isOnline =
        !!nodeLatest && !!siteLatestDateKey && nodeLatest === siteLatestDateKey;
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
      const rawAvg =
        pool.reduce((a, r) => a + r.moisture, 0) / pool.length;
      avgMoisture = Math.round(rawAvg * 10) / 10;
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
