/**
 * Heltec V3 soil VWC + status bands (server-side).
 * Keep in sync with product requirements; dashboard may use a separate copy in src/.
 */

export function adcToVoltage(
  soilRaw: number,
  vRef = 3.3,
  resolution = 4095
): number {
  return (soilRaw / resolution) * vRef;
}

export function voltageToVWC(voltage: number): number {
  if (voltage < 0) return 0;
  if (voltage <= 1.1) return 10 * voltage;
  if (voltage <= 1.3) return 25 * voltage - 17.5;
  if (voltage <= 1.82) return 48.08 * voltage - 47.5;
  if (voltage <= 2.2) return 26.32 * voltage - 7.89;
  if (voltage <= 3.0) return 62.5 * voltage - 87.5;
  return 62.5 * 3.0 - 87.5;
}

/** VWC % with one decimal place (Heltec reference). */
export function soilRawToVWC(soilRaw: number): number {
  const voltage = adcToVoltage(soilRaw);
  return Math.round(voltageToVWC(voltage) * 10) / 10;
}

/** Alias for aggregation / alerts — same as soilRawToVWC. */
export function getMoisturePercent(soilRaw: number): number {
  return soilRawToVWC(soilRaw);
}

export function getBatteryStatus(batteryV: number): { status: string } {
  let status = "GOOD";
  if (batteryV < 3.35) status = "REPLACE";
  else if (batteryV < 3.42) status = "LOW";
  else if (batteryV < 3.5) status = "FAIR";
  return { status };
}

/**
 * Moisture condition bands (ordered; 22% → Optimal before Dry [13,22)):
 * Critical dry ≤12%; gap (12,13)→Dry; Dry [13,22); Optimal [22,35); Wet [35,47); Saturated ≥47.
 */
export function getMoistureStatus(moisturePercent: number): { status: string } {
  const m = moisturePercent;
  if (m <= 12) return { status: "Critical: Dry" };
  if (m > 12 && m < 13) return { status: "Dry" };
  if (m >= 13 && m < 22) return { status: "Dry" };
  if (m >= 22 && m < 35) return { status: "Optimal" };
  if (m >= 35 && m < 47) return { status: "Wet" };
  return { status: "Critical: Saturated" };
}

/** Packet reception % → link health label (GOOD / FAIR / POOR / CRITICAL). */
export function getSignalHealthLabel(packetReceptionPercent: number): string {
  const p = packetReceptionPercent;
  if (p >= 90) return "GOOD";
  if (p >= 75 && p <= 89) return "FAIR";
  if (p >= 50 && p <= 74) return "POOR";
  return "CRITICAL";
}
