import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue, type DataSnapshot } from "firebase/database";

export type NodeGps = { lat: number; lng: number };

/**
 * Live GPS positions from serviceData/sensors for nodes belonging to the site.
 * Nodes without valid lat/lng are omitted.
 */
export function useSiteSensorsGps(siteId: string | null): {
  gpsByNodeId: Record<string, NodeGps>;
  loading: boolean;
} {
  const [gpsByNodeId, setGpsByNodeId] = useState<Record<string, NodeGps>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId?.trim()) {
      setGpsByNodeId({});
      setLoading(false);
      return;
    }

    const sensorsRef = ref(database, "serviceData/sensors");
    const handler = (snap: DataSnapshot) => {
      try {
        if (!snap.exists()) {
          setGpsByNodeId({});
          setLoading(false);
          return;
        }
        const raw = snap.val() as Record<string, Record<string, unknown>>;
        const next: Record<string, NodeGps> = {};
        for (const [nodeId, val] of Object.entries(raw)) {
          if (!val || val.siteId !== siteId) continue;
          const gps = val.gps as Record<string, unknown> | null | undefined;
          if (!gps || typeof gps !== "object") continue;
          const lat = Number(gps.lat);
          const lng = Number(gps.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          next[nodeId] = { lat, lng };
        }
        setGpsByNodeId(next);
      } catch {
        setGpsByNodeId({});
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
        setLoading(false);
      }
    );

    return () => unsub();
  }, [siteId]);

  return { gpsByNodeId, loading };
}
