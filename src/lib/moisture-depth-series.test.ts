import { describe, expect, it } from "vitest";
import {
  buildDepthChartHistoryZoneAllNodes,
  buildDepthChartHistoryZoneAverage,
  buildDepthSeriesKeysForZoneAllNodes,
  buildSeriesKey,
  collectDepthKeysForNodes,
  parseSeriesKey,
} from "./moisture-depth-series";
import { ZONE_AVERAGE_DATA_KEY } from "./zone-moisture-aggregate";

describe("moisture-depth-series", () => {
  it("buildSeriesKey and parseSeriesKey round-trip", () => {
    const k = buildSeriesKey(ZONE_AVERAGE_DATA_KEY, "1");
    expect(parseSeriesKey(k)).toEqual({
      entityId: ZONE_AVERAGE_DATA_KEY,
      depthKey: "1",
    });
    expect(parseSeriesKey("no-delimiter")).toBeNull();
  });

  it("buildDepthChartHistoryZoneAverage averages per depth across nodes", () => {
    const merged = {
      "2025-01-01": {
        a: { "0": 40, "1": 50 },
        b: { "0": 60, "1": 30 },
      },
    };
    const hist = buildDepthChartHistoryZoneAverage(merged, ["a", "b"]);
    expect(hist["2025-01-01"][buildSeriesKey(ZONE_AVERAGE_DATA_KEY, "0")]).toBe(
      50
    );
    expect(hist["2025-01-01"][buildSeriesKey(ZONE_AVERAGE_DATA_KEY, "1")]).toBe(
      40
    );
  });

  it("collectDepthKeysForNodes unions live and history", () => {
    const merged = {
      d1: { n1: { "0": 1, "2": 2 } },
    };
    const live: Record<string, import("@/types/zone").NodeReading> = {
      n1: {
        nodeId: "n1",
        gatewayId: "g",
        moistureByDepth: { "1": 5 },
        moisture: 5,
        batteryVoltage: 3,
        batteryStatus: "Good",
        packetReceptionPercent: 100,
        signal: 100,
        status: "Optimal",
        timestamp: "2025-01-01T00:00:00Z",
        soil_raw: 0,
        rssi: -70,
        online: true,
      },
    };
    expect(collectDepthKeysForNodes(["n1"], merged, live)).toEqual([
      "0",
      "1",
      "2",
    ]);
  });

  it("buildDepthChartHistoryZoneAllNodes merges per-node depth rows", () => {
    const merged = {
      "2025-01-01": {
        a: { "0": 40 },
        b: { "0": 60 },
      },
    };
    const hist = buildDepthChartHistoryZoneAllNodes(merged, ["a", "b"]);
    expect(hist["2025-01-01"][buildSeriesKey("a", "0")]).toBe(40);
    expect(hist["2025-01-01"][buildSeriesKey("b", "0")]).toBe(60);
  });

  it("buildDepthSeriesKeysForZoneAllNodes lists each node depth series", () => {
    const merged = {
      d1: { n1: { "0": 1 }, n2: { "0": 2 } },
    };
    const live = {} as Record<string, import("@/types/zone").NodeReading>;
    const keys = buildDepthSeriesKeysForZoneAllNodes(["n1", "n2"], merged, live);
    expect(keys).toEqual([buildSeriesKey("n1", "0"), buildSeriesKey("n2", "0")]);
  });
});
