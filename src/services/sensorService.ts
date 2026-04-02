import { getBatteryStatus, getMoisturePercent, getMoistureStatus, getSignalPercent } from "@/lib/dataTransform";
import { database } from "@/lib/firebase";
import { ref, onValue, get, Unsubscribe } from "firebase/database";


export interface PacketData {
    packetId: string;
    soil_raw: number;
    battery_v: number;
    rssi: number;
    timestamp: string;
    moisture: number;
    batteryVoltage: string;
    batteryStatus: string;
    signal: number;
    status: string;
}

export interface NodeData {
    nodeId: string;
    latestPacket: PacketData | null;
}

export interface GatewayData {
    gatewayId: string;
    avgMoisture: number;
    avgBattery: number;
    avgBatteryStatus: string;
    avgSignal: number;
    status: string;
    nodeCount: number;
}

export interface GatewayDetailData {
    gatewayId: string;
    nodes: NodeData[];
}

/**
 * Legacy gateway helpers — prefer `aggregationService` / `useAggregatedData` for new code.
 */

/**
 * Fetch gateway detail with all nodes and their latest packets
 */
export const fetchGatewayDetail = async (
    gatewayId: string,
    siteId: string = "siteId:acrelink-1"
): Promise<GatewayDetailData | null> => {
    try {
        const pathRef = ref(database, `sensor-readings/${siteId}/gateways/${gatewayId}`);
        const snapshot = await get(pathRef);

        if (!snapshot.exists()) {
            console.warn(`No data found for gateway: ${gatewayId}`);
            return null;
        }

        const gateway = snapshot.val();
        const nodes: NodeData[] = [];
        const realToday = new Date().toISOString().split('T')[0];

        for (const nodeKey in gateway) {
            if (!nodeKey.startsWith('nodeId:')) continue;

            const node = gateway[nodeKey];
            let packets = node;
            if (node.packets) packets = node.packets;

            let latestPacket: PacketData | null = null;
            let latestTimestamp = 0;

            for (const packetId in packets) {
                const rawData = packets[packetId];
                if (!rawData.timestamp) continue;

                // Skip future packets
                const dateKey = rawData.timestamp.split('T')[0];
                if (dateKey > realToday) continue;

                const moisture = getMoisturePercent(rawData.soil_raw);
                const batteryInfo = getBatteryStatus(rawData.battery_v);
                const signal = getSignalPercent(rawData.rssi);

                const packet: PacketData = {
                    packetId,
                    soil_raw: rawData.soil_raw,
                    battery_v: rawData.battery_v,
                    rssi: rawData.rssi,
                    timestamp: rawData.timestamp,
                    moisture,
                    batteryVoltage: batteryInfo.voltage,
                    batteryStatus: batteryInfo.status,
                    signal,
                    status: getMoistureStatus(moisture).status
                };

                const timestamp = new Date(rawData.timestamp).getTime();
                if (timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                    latestPacket = packet;
                }
            }

            nodes.push({ nodeId: nodeKey, latestPacket });
        }

        return { gatewayId, nodes };
    } catch (error) {
        console.error("Error fetching gateway detail:", error);
        return null;
    }
};

/**
 * Subscribe to real-time gateway updates with averaged node data
 */
export const subscribeToZones = (
    siteId: string = "siteId:acrelink-1",
    callback: (gateways: GatewayData[]) => void
): Unsubscribe => {
    const pathRef = ref(database, `sensor-readings/${siteId}/gateways`);

    return onValue(
        pathRef,
        (snapshot) => {
            if (!snapshot.exists()) {
                console.warn("No data in Firebase at path:", `sensor-readings/${siteId}/gateways`);
                callback([]);
                return;
            }

            const gateways: GatewayData[] = [];
            const gatewaysData = snapshot.val();
            const realToday = new Date().toISOString().split('T')[0];

            for (const gatewayId in gatewaysData) {
                if (!gatewayId ||
                    gatewayId.trim() === '' ||
                    gatewayId.endsWith(':') ||
                    typeof gatewaysData[gatewayId] !== 'object' ||
                    gatewaysData[gatewayId] === null) {
                    continue;
                }

                const gateway = gatewaysData[gatewayId];
                let totalMoisture = 0;
                let totalBattery = 0;
                let totalSignal = 0;
                let nodeCount = 0;
                let gatewayLatestDateKey: string | null = null;

                // First pass: find the gateway's latest date key, capped at today
                for (const nodeKey in gateway) {
                    if (!nodeKey.startsWith('nodeId:')) continue;

                    const node = gateway[nodeKey];
                    let packets = node;
                    if (node.packets) packets = node.packets;

                    for (const packetId in packets) {
                        const rawData = packets[packetId];
                        if (!rawData.timestamp) continue;
                        const dateKey = rawData.timestamp.split('T')[0];
                        if (dateKey > realToday) continue;
                        if (!gatewayLatestDateKey || dateKey > gatewayLatestDateKey) {
                            gatewayLatestDateKey = dateKey;
                        }
                    }
                }

                // Second pass: average only online nodes (those whose latest packet
                // date matches the gateway's latest date)
                for (const nodeKey in gateway) {
                    if (!nodeKey.startsWith('nodeId:')) continue;

                    const node = gateway[nodeKey];
                    let packets = node;
                    if (node.packets) packets = node.packets;

                    let latestPacket: PacketData | null = null;
                    let latestTimestamp = 0;
                    let latestBatteryValue = 0;
                    let nodeLatestDateKey: string | null = null;

                    for (const packetId in packets) {
                        const rawData = packets[packetId];
                        if (!rawData.timestamp) continue;

                        const dateKey = rawData.timestamp.split('T')[0];
                        if (dateKey > realToday) continue;

                        const moisture = getMoisturePercent(rawData.soil_raw);
                        const batteryInfo = getBatteryStatus(rawData.battery_v);
                        const signal = getSignalPercent(rawData.rssi);
                        const statusInfo = getMoistureStatus(moisture);

                        const packet: PacketData = {
                            packetId,
                            soil_raw: rawData.soil_raw,
                            battery_v: rawData.battery_v,
                            rssi: rawData.rssi,
                            timestamp: rawData.timestamp,
                            moisture,
                            batteryVoltage: batteryInfo.voltage,
                            batteryStatus: batteryInfo.status,
                            signal,
                            status: statusInfo.status
                        };

                        const timestamp = new Date(rawData.timestamp).getTime();
                        if (timestamp > latestTimestamp) {
                            latestTimestamp = timestamp;
                            latestPacket = packet;
                            latestBatteryValue = rawData.battery_v;
                            nodeLatestDateKey = dateKey;
                        }
                    }

                    if (latestPacket && !!nodeLatestDateKey && nodeLatestDateKey === gatewayLatestDateKey) {
                        totalMoisture += latestPacket.moisture;
                        totalBattery += latestBatteryValue;
                        totalSignal += latestPacket.signal;
                        nodeCount++;
                    }
                }

                if (nodeCount > 0 && gatewayId && gatewayId.trim() !== '' && !gatewayId.endsWith(':')) {
                    const avgMoisture = Math.round(totalMoisture / nodeCount);
                    const avgBatteryVoltage = Math.round((totalBattery / nodeCount) * 100) / 100;
                    const batteryStatusInfo = getBatteryStatus(avgBatteryVoltage);
                    const statusInfo = getMoistureStatus(avgMoisture);

                    gateways.push({
                        gatewayId,
                        avgMoisture,
                        avgBattery: avgBatteryVoltage,
                        avgBatteryStatus: batteryStatusInfo.status,
                        avgSignal: Math.round(totalSignal / nodeCount),
                        status: statusInfo.status,
                        nodeCount
                    });
                }
            }

            callback(gateways);
        },
        (error) => {
            console.error("Error subscribing to gateways:", error);
            callback([]);
        }
    );
};
