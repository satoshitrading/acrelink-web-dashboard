/**
 * Zone management types — stored at serviceData/zones/{zoneId}
 */

export interface Zone {
  id: string;
  name: string;
  color: string;
  siteId: string;
  /** Bare node IDs e.g. "70A5769E9EF0" */
  nodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ZoneSummary extends Zone {
  avgMoisture: number;
  avgBattery: number;
  avgBatteryStatus: string;
  avgSignal: number;
  /** Derived from average moisture of nodes in zone */
  status: string;
  onlineNodeCount: number;
  totalNodeCount: number;
}

export interface NodeReading {
  nodeId: string;
  /** Full RTDB key e.g. "gatewayId:351457835318343" */
  gatewayId: string;
  moisture: number;
  batteryVoltage: number;
  batteryStatus: string;
  /** 0–100% packet reception over last 7 days (same value as `signal` for charts/alerts). */
  packetReceptionPercent: number;
  signal: number;
  status: string;
  timestamp: string;
  soil_raw: number;
  rssi: number;
  /** Matches site-wide online logic used in historical charts */
  online: boolean;
}

/**
 * Dashboard view filter: `all` | `unassigned` | zone id | `node:{bareNodeId}`.
 * Single-node values use the `node:` prefix (see `NODE_FILTER_PREFIX` in zone-filter-utils).
 */
export type ZoneFilterValue = "all" | "unassigned" | string;
