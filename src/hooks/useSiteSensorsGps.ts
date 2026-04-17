import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue, type DataSnapshot } from "firebase/database";
import { getSensorDisplayName } from "@/lib/sensor-display-name";

export type NodeGps = { lat: number; lng: number };
export type SiteSensorGeoExportRow = {
  displayName: string;
  depth: string | null;
  lastUpdated: string | null;
};

/**
 * Live GPS positions from serviceData/sensors for nodes belonging to the site.
 * Nodes without valid lat/lng are omitted.
 */
export function useSiteSensorsGps(siteId: string | null): {
  gpsByNodeId: Record<string, NodeGps>;
  nodeExportByNodeId: Record<string, SiteSensorGeoExportRow>;
  loading: boolean;
} {
  const [gpsByNodeId, setGpsByNodeId] = useState<Record<string, NodeGps>>({});
  const [nodeExportByNodeId, setNodeExportByNodeId] = useState<
    Record<string, SiteSensorGeoExportRow>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId?.trim()) {
      setGpsByNodeId({});
      setNodeExportByNodeId({});
      setLoading(false);
      return;
    }

    const sensorsRef = ref(database, "serviceData/sensors");
    const handler = (snap: DataSnapshot) => {
      try {
        if (!snap.exists()) {
          setGpsByNodeId({});
          setNodeExportByNodeId({});
          setLoading(false);
          return;
        }
        const raw = snap.val() as Record<string, Record<string, unknown>>;
        const next: Record<string, NodeGps> = {};
        const nextExport: Record<string, SiteSensorGeoExportRow> = {};
        for (const [nodeId, val] of Object.entries(raw)) {
          if (!val || val.siteId !== siteId) continue;
          nextExport[nodeId] = {
            displayName: getSensorDisplayName(
              val as { name?: string; label?: string },
              nodeId
            ),
            depth: typeof val.depth === "string" ? val.depth : null,
            lastUpdated: typeof val.updatedAt === "string" ? val.updatedAt : null,
          };
          const gps = val.gps as Record<string, unknown> | null | undefined;
          if (!gps || typeof gps !== "object") continue;
          const lat = Number(gps.lat);
          const lng = Number(gps.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          next[nodeId] = { lat, lng };
        }
        setGpsByNodeId(next);
        setNodeExportByNodeId(nextExport);
      } catch {
        setGpsByNodeId({});
        setNodeExportByNodeId({});
      } finally {
        setLoading(false);
      }
    };

    const unsub = onValue(
      sensorsRef,
      handler,
      (err) => {
        console.error("useSiteSensorsGps:", err);
        setGpsByNodeId({});
        setNodeExportByNodeId({});
        setLoading(false);
      }
    );

    return () => unsub();
  }, [siteId]);

  return { gpsByNodeId, nodeExportByNodeId, loading };
}
