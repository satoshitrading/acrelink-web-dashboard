/**
 * Coordinated VWC rise across zone nodes (irrigation detection).
 * Tuned constants — align with dashboard VWC via getMoisturePercent(soil_raw).
 */

import { getMoisturePercent } from "./sensorRequirementMath";

export type IrrigationDetectionConfig = {
  /** Sliding window length (ms) to evaluate a coordinated rise */
  windowMs: number;
  /** How far back to scan packet history */
  lookbackMs: number;
  /** Minimum VWC swing (max − min) inside the window for a node to “participate” */
  minDeltaVwc: number;
  /** Minimum fraction of zone nodes that must participate (ceil with ≥2 nodes) */
  fractionNodes: number;
  /** Step when scanning candidate window end times */
  stepMs: number;
  /** No new event for same zone until this long after the previous event end */
  cooldownMs: number;
  /** Only emit if window end is within this age of now (avoids backfilling old history on first deploy) */
  maxEventAgeMs: number;
};

export const DEFAULT_IRRIGATION_DETECTION_CONFIG: IrrigationDetectionConfig = {
  windowMs: 4 * 60 * 60 * 1000,
  lookbackMs: 72 * 60 * 60 * 1000,
  minDeltaVwc: 4,
  fractionNodes: 0.5,
  stepMs: 30 * 60 * 1000,
  cooldownMs: 18 * 60 * 60 * 1000,
  maxEventAgeMs: 48 * 60 * 60 * 1000,
};

export type IrrigationCandidate = {
  timestampIso: string;
  preVwc: number;
  postVwc: number;
  windowMinutes: number;
  nodeCount: number;
};

function parsePacketsFromNode(
  node: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  let packets: Record<string, unknown> = node;
  if (node.packets && typeof node.packets === "object") {
    packets = node.packets as Record<string, unknown>;
  }
  return packets as Record<string, Record<string, unknown>>;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Collect timestamped primary VWC samples per node from gateway tree (last ~72h by caller’s sinceMs).
 */
export function collectPacketsForNodes(
  gatewaysData: Record<string, unknown> | null,
  nodeIds: Set<string>,
  sinceMs: number,
  nowMs: number
): Record<string, { t: number; vwc: number }[]> {
  const out: Record<string, { t: number; vwc: number }[]> = {};
  if (!gatewaysData) return out;

  for (const gatewayId in gatewaysData) {
    if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":")) continue;
    const gateway = gatewaysData[gatewayId] as Record<string, unknown>;
    if (!gateway || typeof gateway !== "object") continue;

    for (const nodeKey in gateway) {
      if (!nodeKey.startsWith("nodeId:")) continue;
      const bareId = nodeKey.replace(/^nodeId:/, "");
      if (!nodeIds.has(bareId)) continue;

      const node = gateway[nodeKey] as Record<string, unknown>;
      const packets = parsePacketsFromNode(node);

      for (const packetId in packets) {
        const rawData = packets[packetId];
        if (!rawData?.timestamp) continue;
        const ts = new Date(String(rawData.timestamp)).getTime();
        if (Number.isNaN(ts) || ts < sinceMs || ts > nowMs) continue;
        const soilRaw = Number(rawData.soil_raw);
        if (!Number.isFinite(soilRaw)) continue;
        const vwc = getMoisturePercent(soilRaw);
        if (!out[bareId]) out[bareId] = [];
        out[bareId].push({ t: ts, vwc });
      }
    }
  }

  for (const id of Object.keys(out)) {
    out[id].sort((a, b) => a.t - b.t);
  }
  return out;
}

/**
 * Find the most recent irrigation-like window end (scan newest → oldest).
 * Returns null if nothing qualifies or zone has fewer than 2 nodes.
 */
export function findLatestIrrigationCandidate(
  zoneNodeIds: string[],
  packetsByNode: Record<string, { t: number; vwc: number }[]>,
  lastEventEndMs: number,
  nowMs: number,
  config: IrrigationDetectionConfig = DEFAULT_IRRIGATION_DETECTION_CONFIG
): IrrigationCandidate | null {
  const n = zoneNodeIds.length;
  if (n < 2) return null;

  const minNodes = Math.max(2, Math.ceil(n * config.fractionNodes));
  const minTEnd = Math.max(nowMs - config.maxEventAgeMs, nowMs - config.lookbackMs);

  for (let tEnd = nowMs; tEnd >= minTEnd; tEnd -= config.stepMs) {
    /* Next distinct irrigation must end after previous event + cooldown */
    if (
      lastEventEndMs > 0 &&
      tEnd <= lastEventEndMs + config.cooldownMs
    ) {
      continue;
    }

    const tStart = tEnd - config.windowMs;
    const mins: number[] = [];
    const maxs: number[] = [];

    for (const nid of zoneNodeIds) {
      const pts = packetsByNode[nid];
      if (!pts?.length) continue;
      const inWin = pts.filter((p) => p.t >= tStart && p.t <= tEnd);
      if (inWin.length === 0) continue;
      const minV = Math.min(...inWin.map((p) => p.vwc));
      const maxV = Math.max(...inWin.map((p) => p.vwc));
      if (maxV - minV >= config.minDeltaVwc) {
        mins.push(minV);
        maxs.push(maxV);
      }
    }

    if (mins.length >= minNodes) {
      const preVwc = round1(mins.reduce((a, b) => a + b, 0) / mins.length);
      const postVwc = round1(maxs.reduce((a, b) => a + b, 0) / maxs.length);
      return {
        timestampIso: new Date(tEnd).toISOString(),
        preVwc,
        postVwc,
        windowMinutes: Math.round(config.windowMs / 60000),
        nodeCount: mins.length,
      };
    }
  }

  return null;
}
