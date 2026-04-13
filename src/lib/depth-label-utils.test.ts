import { describe, expect, it } from "vitest";
import {
  labelForDepthIndex,
  sanitizeDepthLabelsForWrite,
} from "./depth-label-utils";

describe("labelForDepthIndex", () => {
  it("prefers soil_raw_N over numeric key when both exist", () => {
    expect(
      labelForDepthIndex(
        { "0": "from numeric", soil_raw_0: "from soil key" },
        "0"
      )
    ).toBe("from soil key");
  });

  it("uses numeric key when soil_raw_N absent", () => {
    expect(labelForDepthIndex({ "1": "12 in" }, "1")).toBe("12 in");
  });

  it("uses soil_raw_N when only that key exists (RTDB shape)", () => {
    expect(
      labelForDepthIndex({ soil_raw_0: "6 inch", soil_raw_1: "12 inch" }, "0")
    ).toBe("6 inch");
    expect(
      labelForDepthIndex({ soil_raw_0: "6 inch", soil_raw_1: "12 inch" }, "1")
    ).toBe("12 inch");
  });

  it("returns undefined when missing", () => {
    expect(labelForDepthIndex({}, "0")).toBeUndefined();
    expect(labelForDepthIndex(undefined, "0")).toBeUndefined();
  });
});

describe("sanitizeDepthLabelsForWrite", () => {
  it("keeps soil_raw_N and numeric keys with non-empty values", () => {
    expect(
      sanitizeDepthLabelsForWrite({
        soil_raw_0: " 6 in ",
        "1": "deep",
        nodeId: "BAD",
        junk: "x",
      })
    ).toEqual({ soil_raw_0: "6 in", "1": "deep" });
  });

  it("drops empty trimmed values", () => {
    expect(
      sanitizeDepthLabelsForWrite({ soil_raw_0: "   ", "0": "ok" })
    ).toEqual({ "0": "ok" });
  });
});
