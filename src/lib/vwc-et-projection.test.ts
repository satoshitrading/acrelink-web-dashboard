import { describe, expect, it } from "vitest";
import {
  calibrateKVwcPerMmEt,
  DEFAULT_K_VWC_PER_MM_ET,
  findWarnThresholdCrossing,
  projectVwcWithEt,
} from "./vwc-et-projection";

describe("calibrateKVwcPerMmEt", () => {
  it("returns positive default when no pairs", () => {
    expect(calibrateKVwcPerMmEt([], {}, {})).toBeGreaterThan(0);
  });

  it("estimates k from consecutive drying", () => {
    const dates = ["2026-04-10", "2026-04-11", "2026-04-12"];
    const vwc = { "2026-04-10": 40, "2026-04-11": 36, "2026-04-12": 30 };
    const et = { "2026-04-11": 4, "2026-04-12": 5 };
    const k = calibrateKVwcPerMmEt(dates, vwc, et);
    expect(k).toBeGreaterThan(0.9);
    expect(k).toBeLessThan(1.3);
  });

  it("does not pair non-consecutive calendar dates (sparse history)", () => {
    const dates = ["2026-04-10", "2026-04-12"];
    const vwc = { "2026-04-10": 40, "2026-04-12": 30 };
    const et = { "2026-04-12": 4 };
    const k = calibrateKVwcPerMmEt(dates, vwc, et);
    expect(k).toBe(DEFAULT_K_VWC_PER_MM_ET);
  });
});

describe("projectVwcWithEt", () => {
  it("steps down with ET", () => {
    const start = new Date("2026-04-13T12:00:00.000Z");
    const et: Record<string, number | undefined> = {
      "2026-04-13": 2,
      "2026-04-14": 4,
      "2026-04-15": 0,
    };
    const pts = projectVwcWithEt(20, 1, start, et, 2);
    expect(pts).toHaveLength(3);
    expect(pts[0]!.vwc).toBe(20);
    expect(pts[1]!.vwc).toBe(16);
    expect(pts[2]!.vwc).toBe(16);
  });
});

describe("findWarnThresholdCrossing", () => {
  it("handles no threshold", () => {
    expect(findWarnThresholdCrossing([{ isoDate: "a", vwc: 50 }], null).kind).toBe(
      "no_warn_threshold"
    );
  });

  it("detects already below", () => {
    expect(
      findWarnThresholdCrossing(
        [
          { isoDate: "a", vwc: 10 },
          { isoDate: "b", vwc: 5 },
        ],
        20
      ).kind
    ).toBe("already_below");
  });

  it("interpolates crossing", () => {
    const r = findWarnThresholdCrossing(
      [
        { isoDate: "a", vwc: 50 },
        { isoDate: "b", vwc: 30 },
      ],
      40
    );
    expect(r.kind).toBe("cross");
    if (r.kind === "cross") {
      expect(r.fractionalDayFromStart).toBeCloseTo(0.5, 5);
    }
  });
});
