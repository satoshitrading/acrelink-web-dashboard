/**
 * Battery status thresholds and color mapping utilities
 */
export const getBatteryStatusColor = (voltage: number) => {
    if (voltage >= 3.5) {
        return { status: "GOOD", text: "text-green-600", bg: "bg-green-500/20", badgeBg: "bg-green-200" };
    } else if (voltage >= 3.42 && voltage <= 3.49) {
        return { status: "FAIR", text: "text-yellow-600", bg: "bg-yellow-500/20", badgeBg: "bg-yellow-200" };
    } else if (voltage >= 3.35 && voltage <= 3.41) {
        return { status: "LOW", text: "text-orange-600", bg: "bg-orange-500/20", badgeBg: "bg-orange-200" };
    } else {
        return { status: "REPLACE", text: "text-red-600", bg: "bg-red-500/20", badgeBg: "bg-red-200" };
    }
};

/**
 * Signal strength status thresholds and color mapping utilities
 */
export const getSignalStatusColor = (signal: number) => {
    if (signal >= 90) {
        return { status: "GOOD", text: "text-green-600", bg: "bg-green-500/20", badgeBg: "bg-green-200" };
    } else if (signal >= 75 && signal <= 89) {
        return { status: "FAIR", text: "text-yellow-600", bg: "bg-yellow-500/20", badgeBg: "bg-yellow-200" };
    } else if (signal >= 50 && signal <= 74) {
        return { status: "POOR", text: "text-orange-600", bg: "bg-orange-500/20", badgeBg: "bg-orange-200" };
    } else {
        return { status: "CRITICAL", text: "text-red-600", bg: "bg-red-500/20", badgeBg: "bg-red-200" };
    }
};

/**
 * Moisture status color mapping for different moisture levels
 */
export const getMoistureStatusColors = (status: string) => {
    const statusColors: Record<string, { bg: string; border: string; text: string; bar: string }> = {
        Offline: { bg: "bg-red-600/10", border: "border-red-600/60", text: "text-red-600 dark:text-red-400", bar: "bg-red-600" },
        "Critical: Dry": { bg: "bg-green-500/10", border: "border-green-500/60", text: "text-green-600 dark:text-green-400", bar: "bg-green-500" },
        "Dry": { bg: "bg-yellow-500/10", border: "border-yellow-500/60", text: "text-yellow-600 dark:text-yellow-400", bar: "bg-yellow-500" },
        "Optimal": { bg: "bg-green-500/10", border: "border-green-500/60", text: "text-green-600 dark:text-green-400", bar: "bg-green-500" },
        "Wet": { bg: "bg-blue-500/10", border: "border-blue-500/60", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
        "Critical: Saturated": { bg: "bg-red-500/10", border: "border-red-500/60", text: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
    };

    return statusColors[status] || statusColors["Optimal"];
};
