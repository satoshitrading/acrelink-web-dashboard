/** RTDB: irrigation_events/{siteId}/{zoneId}/events/{pushId} */
export type IrrigationEventRow = {
  timestamp: string;
  preVwc: number;
  postVwc: number;
  siteId?: string;
  zoneId?: string;
  windowMinutes?: number;
  nodeCount?: number;
  createdAt?: string;
};
