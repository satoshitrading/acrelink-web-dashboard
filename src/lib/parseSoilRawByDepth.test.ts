import { describe, expect, it } from "vitest";
import { parseSoilRawByDepth } from "./parseSoilRawByDepth";

describe("parseSoilRawByDepth", () => {
  it("maps legacy soil_raw only to depth 0", () => {
    expect(parseSoilRawByDepth({ soil_raw: 1200 })).toEqual({ "0": 1200 });
  });

  it("uses soil_raw_0 and soil_raw_1 when present", () => {
    expect(
      parseSoilRawByDepth({ soil_raw_0: 100, soil_raw_1: 200, battery_v: 3 })
    ).toEqual({ "0": 100, "1": 200 });
  });

  it("prefers soil_raw_0 over bare soil_raw when both exist", () => {
    expect(parseSoilRawByDepth({ soil_raw: 999, soil_raw_0: 100 })).toEqual({
      "0": 100,
    });
  });

  it("ignores bare soil_raw when soil_raw_0 exists", () => {
    expect(
      parseSoilRawByDepth({ soil_raw: 999, soil_raw_0: 50, soil_raw_1: 75 })
    ).toEqual({ "0": 50, "1": 75 });
  });

  it("ignores non-numeric and unknown keys", () => {
    expect(
      parseSoilRawByDepth({
        soil_raw: "x",
        soil_raw_0: 10,
        soil_raw_abc: 1,
        soil_raw_2: NaN,
      } as Record<string, unknown>)
    ).toEqual({ "0": 10 });
  });

  it("returns empty when no soil fields", () => {
    expect(parseSoilRawByDepth({ battery_v: 3 })).toEqual({});
  });
});
