import { describe, expect, it } from "vitest";
import {
  buildZoneIrrigationSummary,
  countSeasonIrrigationEvents,
} from "./irrigation-metrics";
import type { IrrigationEventRow } from "@/types/irrigation";
import type { Zone } from "@/types/zone";

describe("countSeasonIrrigationEvents", () => {
  it("counts events in calendar year only", () => {
    const y = new Date().getFullYear();
    const jan = new Date(y, 5, 15).toISOString();
    const lastYear = new Date(y - 1, 11, 15).toISOString();
    const ev = (ts: string): IrrigationEventRow => ({
      timestamp: ts,
      preVwc: 20,
      postVwc: 28,
    });
    const n = countSeasonIrrigationEvents(
      { z1: [ev(jan), ev(lastYear)] },
      new Date(y, 5, 20)
    );
    expect(n).toBe(1);
  });
});

describe("buildZoneIrrigationSummary", () => {
  const baseZone = (id: string, name: string, nodeIds: string[]): Zone => ({
    id,
    name,
    color: "#000",
    siteId: "s1",
    nodeIds,
    createdAt: "",
    updatedAt: "",
  });

  it("computes max days since among zones with events", () => {
    const fixedNow = new Date("2026-06-15T12:00:00.000Z");
    const zones = [
      baseZone("a", "A", ["1"]),
      baseZone("b", "B", ["2"]),
    ];
    const recent = new Date(fixedNow.getTime() - 2 * 86400000).toISOString();
    const older = new Date(fixedNow.getTime() - 10 * 86400000).toISOString();
    const events: Record<string, IrrigationEventRow[]> = {
      a: [{ timestamp: recent, preVwc: 20, postVwc: 25 }],
      b: [{ timestamp: older, preVwc: 18, postVwc: 24 }],
    };
    const { maxDaysSinceLastDetected, perZone } = buildZoneIrrigationSummary(
      zones,
      events,
      fixedNow
    );
    expect(maxDaysSinceLastDetected).toBe(10);
    expect(perZone.find((p) => p.zoneId === "a")?.daysSince).toBe(2);
  });

  it("skips max for zones with no events", () => {
    const zones = [baseZone("a", "A", ["1"])];
    const { maxDaysSinceLastDetected } = buildZoneIrrigationSummary(zones, {});
    expect(maxDaysSinceLastDetected).toBeNull();
  });
});
