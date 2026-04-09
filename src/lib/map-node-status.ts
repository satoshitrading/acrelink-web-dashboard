import type { NodeReading } from "@/types/zone";
import { moistureStatusToChartHex } from "@/lib/moistureStatusPalette";

/** Map marker legend categories (milestone: green ok, yellow warn, red dry, gray offline). */
export type MapNodeStatusCategory = "offline" | "dry" | "warn" | "ok";

const DRY_STATUSES = new Set(["Dry", "Critical: Dry"]);

const WARN_STATUSES = new Set([
  "Wet",
  "Critical: Saturated",
]);

/**
 * Derives map marker category from live node reading.
 * Offline nodes are always gray; online nodes use moisture status strings from aggregation.
 */
export function mapNodeStatusCategory(
  reading: NodeReading | undefined
): MapNodeStatusCategory {
  if (!reading || !reading.online) return "offline";
  const s = reading.status;
  if (DRY_STATUSES.has(s)) return "dry";
  if (WARN_STATUSES.has(s)) return "warn";
  if (s === "Optimal") return "ok";
  // Any other status falls back to warn for visibility
  return "warn";
}

export const MAP_MARKER_COLORS: Record<MapNodeStatusCategory, string> = {
  offline: "#6b7280",
  ok: "#22c55e",
  warn: "#eab308",
  dry: "#ef4444",
};

/** Marker fill color aligned with charts / zone cards (`moistureStatusToChartHex`). */
export function mapNodeMarkerFillHex(reading: NodeReading | undefined): string {
  if (!reading || !reading.online) return "#6b7280";
  return moistureStatusToChartHex(reading.status);
}
