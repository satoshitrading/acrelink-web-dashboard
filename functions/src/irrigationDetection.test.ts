import { describe, expect, it } from "vitest";
import {
  collectPacketsForNodes,
  findLatestIrrigationCandidate,
  DEFAULT_IRRIGATION_DETECTION_CONFIG,
  type IrrigationDetectionConfig,
} from "./irrigationDetection";

const W = DEFAULT_IRRIGATION_DETECTION_CONFIG.windowMs;

function buildGatewayWithPackets(
  nodePackets: Record<string, { t: number; vwc: number }[]>
): Record<string, unknown> {
  const gateways: Record<string, unknown> = {
    gw1: {} as Record<string, unknown>,
  };
  const g = gateways.gw1 as Record<string, unknown>;
  for (const [nodeId, pts] of Object.entries(nodePackets)) {
    const nodeKey = `nodeId:${nodeId}`;
    const packets: Record<string, { timestamp: string; soil_raw: number }> = {};
    pts.forEach((p, i) => {
      // soil_raw chosen so getMoisturePercent yields ~p.vwc for test ranges (approximate)
      packets[`packetId:${i}`] = {
        timestamp: new Date(p.t).toISOString(),
        soil_raw: p.vwc * 100,
      };
    });
    g[nodeKey] = { packets };
  }
  return gateways;
}

describe("findLatestIrrigationCandidate", () => {
  const cfg: IrrigationDetectionConfig = {
    ...DEFAULT_IRRIGATION_DETECTION_CONFIG,
    maxEventAgeMs: 7 * 24 * 60 * 60 * 1000,
    lookbackMs: 7 * 24 * 60 * 60 * 1000,
  };

  it("returns null when zone has fewer than 2 nodes", () => {
    const now = Date.now();
    const res = findLatestIrrigationCandidate(
      ["a"],
      { a: [{ t: now - 1000, vwc: 20 }] },
      0,
      now,
      cfg
    );
    expect(res).toBeNull();
  });

  it("detects coordinated rise across two nodes in window", () => {
    const tEnd = Date.now();
    const tStart = tEnd - W;
    const packets: Record<string, { t: number; vwc: number }[]> = {
      a: [
        { t: tStart + 60_000, vwc: 20 },
        { t: tEnd - 60_000, vwc: 26 },
      ],
      b: [
        { t: tStart + 120_000, vwc: 19 },
        { t: tEnd - 30_000, vwc: 25 },
      ],
    };
    const res = findLatestIrrigationCandidate(["a", "b"], packets, 0, tEnd, cfg);
    expect(res).not.toBeNull();
    expect(res!.nodeCount).toBeGreaterThanOrEqual(2);
    expect(res!.postVwc - res!.preVwc).toBeGreaterThan(0);
  });

  it("respects cooldown after last event", () => {
    const tEnd = Date.now();
    const tStart = tEnd - W;
    const packets: Record<string, { t: number; vwc: number }[]> = {
      a: [
        { t: tStart + 60_000, vwc: 20 },
        { t: tEnd - 60_000, vwc: 26 },
      ],
      b: [
        { t: tStart + 120_000, vwc: 19 },
        { t: tEnd - 30_000, vwc: 25 },
      ],
    };
    const lastEnd = tEnd - W / 2;
    const res = findLatestIrrigationCandidate(
      ["a", "b"],
      packets,
      lastEnd,
      tEnd,
      cfg
    );
    expect(res).toBeNull();
  });
});

describe("collectPacketsForNodes", () => {
  it("collects only requested nodes within time range", () => {
    const now = Date.now();
    const since = now - 60 * 60 * 1000;
    const gw = buildGatewayWithPackets({
      n1: [
        { t: since + 1000, vwc: 22 },
        { t: now - 1000, vwc: 24 },
      ],
      n2: [{ t: since - 10_000, vwc: 30 }],
    });
    const set = new Set(["n1"]);
    const out = collectPacketsForNodes(gw, set, since, now);
    expect(out.n1?.length).toBe(2);
    expect(out.n2).toBeUndefined();
  });
});
