/**
 * useServiceData.ts
 * Place at: src/hooks/useServiceData.ts
 *
 * Firebase Realtime DB hook for AcreLink Service page.
 * Mirrors the auth + role pattern in Dashboard.tsx exactly.
 *
 * ── DB READ (existing, never written to) ──────────────────────────────────────
 *   sensor-readings/siteId:{id}/gateways/gatewayId:{id}/nodeId:{id}/packetId:{n}
 *     { battery_v, rssi, snr, soil_raw, timestamp, nodeId }
 *
 * ── DB READ/WRITE (new parallel branch) ──────────────────────────────────────
 *   serviceData/
 *     sites/{siteId}/            { name, info }
 *     sensors/{nodeId}/          { depth, gps, status, notes, installDate, siteId, label, name, nameManual }
 *     serviceEvents/{pushId}/    { techName, nodeIds[], remarks, timestamp, siteId }
 *
 * ── Role-based access (matches Dashboard.tsx) ────────────────────────────────
 *   users/{uid}/{ role: "admin" }                           → all sites
 *   users/{uid}/{ role: "technician", siteIds: [...] }     → assigned sites only
 */

import { useEffect, useState, useCallback } from "react";
import { database, auth } from "@/lib/firebase";
import { ref, onValue, set, push, off, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SensorStatus = "Planned" | "Installed" | "Needs service" | "Offline";

export type SensorMeta = {
  id: string;
  /** Farmer-facing display name (preferred over legacy `label`). */
  name?: string;
  updatedAt?: string;
  /** When true, zone auto-naming must not overwrite `name`. */
  nameManual?: boolean;
  label?: string;
  siteId: string;
  depth?: "Shallow (0–6 in)" | "Medium (6–12 in)" | "Deep (12–24 in)";
  installDate?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracyFt: number;
    capturedAt: string;
  } | null;
  status?: SensorStatus;
  notes?: string;
  /** Alert when this node's moisture (VWC %) drops below this value. */
  moistureThresholdVwc?: number | null;
  /** Optional labels per depth index (`"0"`, `"1"`, …), e.g. `"6 inches"`. */
  depthLabels?: Record<string, string>;
};

export type SensorTelemetry = {
  devEUI?: string;
  battery?: string;
  rf?: string;
  rssi?: number;
  snr?: number;
  soil_raw?: number;
  lastSeen?: string;
};

export type Sensor = SensorMeta & SensorTelemetry;

export type Site = {
  id: string;
  name: string;
  info?: string;
  planned?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rssiToRF = (rssi: number): string => {
  if (rssi >= -70) return "Good";
  if (rssi >= -85) return "Fair";
  return "Poor";
};

/**
 * Walk sensor-readings/siteId:{id}/gateways/gatewayId:{id}/nodeId:{id}
 * Returns flat map: nodeId → SensorTelemetry (latest packet per node)
 */
const parseTelemetry = (
  sensorReadings: Record<string, any>
): Record<string, SensorTelemetry> => {
  const result: Record<string, SensorTelemetry> = {};

  for (const [siteKey, siteVal] of Object.entries(sensorReadings)) {
    if (!siteKey.startsWith("siteId:")) continue;
    const gateways = (siteVal as any)?.gateways;
    if (!gateways) continue;

    for (const gatewayVal of Object.values(gateways) as any[]) {
      for (const [nodeKey, nodeVal] of Object.entries(gatewayVal) as [string, any][]) {
        if (!nodeKey.startsWith("nodeId:")) continue;
        const nodeId = nodeKey.replace("nodeId:", "");

        // Packets may be direct children or nested under a "packets" key
        const packets = (nodeVal as any).packets ?? nodeVal;
        const packetList = Object.values(packets as Record<string, any>);
        if (!packetList.length) continue;

        const latest = packetList.sort(
          (a: any, b: any) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0] as any;

        result[nodeId] = {
          devEUI: nodeId,
          battery: `${latest.battery_v}V`,
          rf: rssiToRF(latest.rssi),
          rssi: latest.rssi,
          snr: latest.snr,
          soil_raw: latest.soil_raw,
          lastSeen: new Date(latest.timestamp).toLocaleString("en-US", {
            hour12: true,
          }),
        };
      }
    }
  }

  return result;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useServiceData = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, SensorTelemetry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── 1. Auth → role → allowed siteIds → filtered sites ────────────────────
  // Mirrors Dashboard.tsx fetchUserSiteId logic exactly
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        const userSnap = await get(ref(database, `users/${user.uid}`));
        if (!userSnap.exists()) return;
        const userData = userSnap.val();

        const isAdmin = userData.role === "admin";
        let allowedSiteIds: string[] = [];

        if (isAdmin) {
          // Admin: discover site IDs from sensor-readings keys (same as Dashboard)
          const srSnap = await get(ref(database, "sensor-readings"));
          if (srSnap.exists()) {
            allowedSiteIds = Object.keys(srSnap.val())
              .filter((k) => k.startsWith("siteId:"))
              .map((k) => k.replace("siteId:", ""));
          }
        } else if (
          userData.role === "technician" &&
          Array.isArray(userData.siteIds)
        ) {
          // Technician: use their assigned siteIds array (same as Dashboard)
          allowedSiteIds = userData.siteIds;
        }

        // Subscribe to serviceData/sites, filter to allowed IDs
        const sitesRef = ref(database, "serviceData/sites");
        const unsubSites = onValue(
          sitesRef,
          (snap) => {
            if (!snap.exists()) {
              setSites([]);
              return;
            }
            const all = snap.val() as Record<string, any>;
            const list: Site[] = Object.entries(all)
              .filter(([id]) => isAdmin || allowedSiteIds.includes(id))
              .map(([id, val]) => ({
                id,
                name: val.name,
                info: val.info ?? "",
              }));
            setSites(list);
          },
          (err) => setError(err.message)
        );

        return () => off(sitesRef, "value", unsubSites);
      } catch (err: any) {
        setError(err.message);
      }
    });

    return () => unsubAuth();
  }, []);

  // ── 2. Subscribe to serviceData/sensors ──────────────────────────────────
  useEffect(() => {
    const sensorsRef = ref(database, "serviceData/sensors");
    const unsub = onValue(
      sensorsRef,
      (snap) => {
        if (!snap.exists()) {
          setSensors([]);
          setLoading(false);
          return;
        }
        const data = snap.val() as Record<string, any>;
        const list: SensorMeta[] = Object.entries(data).map(([id, val]) => ({
          id,
          ...val,
        }));
        // Merge service metadata + live telemetry
        setSensors(
          list.map((s) => ({
            ...s,
            ...(telemetryMap[s.id] ?? {}),
          }))
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => off(sensorsRef, "value", unsub);
  }, [telemetryMap]);

  // ── 3. Live telemetry subscription ───────────────────────────────────────
  useEffect(() => {
    const telemetryRef = ref(database, "sensor-readings");
    const unsub = onValue(
      telemetryRef,
      (snap) => {
        if (!snap.exists()) return;
        setTelemetryMap(parseTelemetry(snap.val()));
      },
      (err) => console.error("Telemetry read error:", err)
    );
    return () => off(telemetryRef, "value", unsub);
  }, []);

  // ── Derived: sensor count per site ───────────────────────────────────────
  const sitesWithCount = sites.map((site) => ({
    ...site,
    planned: sensors.filter((s) => s.siteId === site.id).length,
  }));

  // ── Write: save sensor metadata (never writes telemetry fields) ───────────
  const saveSensor = useCallback(async (sensor: Sensor): Promise<void> => {
    const { devEUI, battery, rf, lastSeen, rssi, snr, soil_raw, ...meta } = sensor;
    await set(ref(database, `serviceData/sensors/${sensor.id}`), {
      ...meta,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  // ── Write: create / update a site ────────────────────────────────────────
  const saveSite = useCallback(async (site: Omit<Site, "planned">): Promise<void> => {
    await set(ref(database, `serviceData/sites/${site.id}`), {
      name: site.name,
      info: site.info ?? "",
    });
  }, []);

  // ── Write: log a service event ────────────────────────────────────────────
  const logServiceEvent = useCallback(
    async (params: {
      techName: string;
      nodeIds: string[];
      remarks: string;
      siteId: string;
    }): Promise<void> => {
      await push(ref(database, "serviceData/serviceEvents"), {
        ...params,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  // ── Read: service history for a node (from serviceEvents) ─────────────────
  const fetchHistory = useCallback(async (nodeId: string): Promise<string[]> => {
    const snap = await get(ref(database, "serviceData/serviceEvents"));
    if (!snap.exists()) return [];

    const events = snap.val() as Record<string, any>;
    return Object.values(events)
      .filter((e) => Array.isArray(e.nodeIds) && e.nodeIds.includes(nodeId))
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .map((e) => {
        const date = new Date(e.timestamp).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        return `${date} – ${e.techName}: ${e.remarks || "Service visit"}`;
      });
  }, []);

  return {
    sites: sitesWithCount,
    sensors,
    telemetryMap,
    loading,
    error,
    saveSensor,
    saveSite,
    logServiceEvent,
    fetchHistory,
  };
};
