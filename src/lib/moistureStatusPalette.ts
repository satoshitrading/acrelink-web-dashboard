/**
 * Hex colors for charts and Leaflet layers derived from moisture status strings.
 * Aligns with getMoistureStatusColors in sensor-status-utils.ts.
 */
export function moistureStatusToChartHex(status: string): string {
  switch (status) {
    case "Offline":
      return "#6b7280";
    case "Critical: Dry":
    case "Critical: Saturated":
      return "#ef4444";
    case "Dry":
      return "#eab308";
    case "Optimal":
      return "#22c55e";
    case "Wet":
      return "#3b82f6";
    default:
      return "#6366f1";
  }
}
