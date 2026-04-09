/** Max outer radius for pivot editor sliders / handles (meters). */
export const PIVOT_RADIUS_MAX_M = 3000;

/** Minimum annulus thickness: outer must exceed inner by at least this (meters). */
export const PIVOT_RADIUS_MIN_GAP_M = 10;

export const PIVOT_DEFAULT_OUTER_M = 400;
export const PIVOT_DEFAULT_INNER_M = 0;

/**
 * Clamp inner/outer radii to valid ranges and enforce outer > inner + gap.
 */
export function clampPivotRadii(inner: number, outer: number): {
  inner: number;
  outer: number;
} {
  const gap = PIVOT_RADIUS_MIN_GAP_M;
  const max = PIVOT_RADIUS_MAX_M;
  let i = Number(inner);
  let o = Number(outer);
  if (!Number.isFinite(i)) i = PIVOT_DEFAULT_INNER_M;
  if (!Number.isFinite(o)) o = PIVOT_DEFAULT_OUTER_M;
  i = Math.max(0, Math.min(i, max));
  o = Math.max(0, Math.min(o, max));
  if (o < i + gap) {
    o = i + gap;
    if (o > max) {
      o = max;
      i = Math.max(0, o - gap);
    }
  }
  return { inner: i, outer: o };
}
