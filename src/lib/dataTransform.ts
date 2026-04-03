/**
 * Data Transformation utilities for sensor readings
 * Converts raw Firebase data to display-ready values
 */

// Constants from hardware specification
const ADC_MAX = 4095;    // 12-bit ADC
const VREF = 3.3;        // Reference voltage

/**
 * Convert soil_raw (ADC value) to Moisture % (VWC)
 * Uses calibration curve from capacitive soil moisture sensor
 */
export function getMoisturePercent(soilRaw: number): number {
    const voltage = (soilRaw / ADC_MAX) * VREF;

    let vwc = 0;
    if (voltage <= 1.1) {
        vwc = 10 * voltage;
    } else if (voltage <= 1.3) {
        vwc = (25 * voltage) - 17.5;
    } else if (voltage <= 1.82) {
        vwc = (48.08 * voltage) - 47.5;
    } else if (voltage <= 2.2) {
        vwc = (26.32 * voltage) - 7.89;
    } else {
        vwc = (62.5 * voltage) - 87.5;
    }

    return Math.round(Math.max(0, Math.min(100, vwc)));
}

/**
 * Get battery status based on voltage
 */
export function getBatteryStatus(batteryV: number): {
    voltage: string;
    status: "Good" | "Fair" | "Low" | "Replace";
    color: string;
} {
    let status: "Good" | "Fair" | "Low" | "Replace" = "Good";
    let color = "text-green-600";

    if (batteryV < 3.35) {
        status = "Replace";
        color = "text-red-600";
    } else if (batteryV < 3.42) {
        status = "Low";
        color = "text-orange-600";
    } else if (batteryV < 3.5) {
        status = "Fair";
        color = "text-yellow-600";
    }

    return {
        voltage: batteryV.toFixed(2) + "V",
        status,
        color
    };
}

/**
 * Expected uplink packets in a 7-day window at 2-hour field cadence (12/day).
 */
export const EXPECTED_PACKETS_7D = 84;

/**
 * Packet reception rate as 0–100% for dashboard "signal" / link health bands.
 */
export function packetReceptionPercentFromCount(received: number): number {
    if (received <= 0) return 0;
    const pct = (received / EXPECTED_PACKETS_7D) * 100;
    return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

/**
 * Count packets with timestamps in (now − 7d, now], excluding future calendar dates.
 */
export function countPacketsReceivedInLast7Days(
    packets: Record<string, Record<string, unknown>>,
    realToday: string
): number {
    const nowMs = Date.now();
    const windowStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    let n = 0;
    for (const packetId in packets) {
        const rawData = packets[packetId];
        if (!rawData?.timestamp) continue;
        const dateKey = String(rawData.timestamp).split("T")[0];
        if (dateKey > realToday) continue;
        const ts = new Date(String(rawData.timestamp)).getTime();
        if (Number.isNaN(ts) || ts <= windowStartMs || ts > nowMs) continue;
        n++;
    }
    return n;
}

/**
 * @deprecated Legacy RSSI → pseudo-%; prefer packet reception rate in aggregation.
 */
export function getSignalPercent(rssi: number): number {
    if (rssi >= -70) return 95;
    if (rssi >= -85) return 80;
    if (rssi >= -100) return 60;
    return 40;
}

/**
 * Get moisture status based on moisture percentage
 */
export function getMoistureStatus(moisturePercent: number): {
    status: string;
    color: string;
    bgColor: string;
    borderColor: string;
} {
    let status = "Optimal";
    let color = "text-green-600";
    let bgColor = "bg-green-500/10";
    let borderColor = "border-green-500/60";

    if (moisturePercent <= 12) {
        status = "Critical: Dry";
        color = "text-red-600";
        bgColor = "bg-red-500/10";
        borderColor = "border-red-500/60";
    } else if (moisturePercent <= 22) {
        status = "Dry";
        color = "text-yellow-600";
        bgColor = "bg-yellow-500/10";
        borderColor = "border-yellow-500/60";
    } else if (moisturePercent <= 34) {
        status = "Optimal";
        color = "text-green-600";
        bgColor = "bg-green-500/10";
        borderColor = "border-green-500/60";
    } else if (moisturePercent <= 46) {
        status = "Wet";
        color = "text-blue-600";
        bgColor = "bg-blue-500/10";
        borderColor = "border-blue-500/60";
    } else {
        status = "Critical: Saturated";
        color = "text-red-600";
        bgColor = "bg-red-500/10";
        borderColor = "border-red-500/60";
    }

    return { status, color, bgColor, borderColor };
}
