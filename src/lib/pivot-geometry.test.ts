import { describe, it, expect } from "vitest";
import { clampPivotRadii, PIVOT_RADIUS_MAX_M, PIVOT_RADIUS_MIN_GAP_M } from "./pivot-geometry";

describe("clampPivotRadii", () => {
  it("replaces NaN inputs with defaults instead of propagating NaN", () => {
    const { inner, outer } = clampPivotRadii(Number.NaN, Number.NaN);
    expect(Number.isFinite(inner)).toBe(true);
    expect(Number.isFinite(outer)).toBe(true);
    expect(outer).toBeGreaterThan(inner);
  });

  it("enforces minimum gap between inner and outer", () => {
    const { inner, outer } = clampPivotRadii(100, 105);
    expect(outer - inner).toBeGreaterThanOrEqual(PIVOT_RADIUS_MIN_GAP_M);
  });

  it("reduces inner when outer hits max", () => {
    const { inner, outer } = clampPivotRadii(PIVOT_RADIUS_MAX_M - 1, PIVOT_RADIUS_MAX_M);
    expect(outer).toBe(PIVOT_RADIUS_MAX_M);
    expect(inner).toBeLessThanOrEqual(outer - PIVOT_RADIUS_MIN_GAP_M);
  });
});
