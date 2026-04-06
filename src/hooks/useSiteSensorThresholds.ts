import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

/**
 * All per-node moistureThresholdVwc values for sensors on this site (live).
 */
export function useSiteSensorThresholds(
  siteId: string | null
): Record<string, number | null | undefined> {
  const [map, setMap] = useState<Record<string, number | null | undefined>>({});

  useEffect(() => {
    if (!siteId?.trim()) {
      setMap({});
      return;
    }

    const sensorsRef = ref(database, "serviceData/sensors");
    const unsub = onValue(sensorsRef, (snap) => {
      if (!snap.exists()) {
        setMap({});
        return;
      }
      const raw = snap.val() as Record<string, Record<string, unknown>>;
      const next: Record<string, number | null | undefined> = {};
      for (const [nodeId, row] of Object.entries(raw)) {
        if (!row || row.siteId !== siteId) continue;
        const v = row.moistureThresholdVwc;
        if (v === undefined) next[nodeId] = undefined;
        else if (v === null) next[nodeId] = null;
        else {
          const n = Number(v);
          next[nodeId] = Number.isFinite(n) ? n : undefined;
        }
      }
      setMap(next);
    });

    return () => unsub();
  }, [siteId]);

  return map;
}
