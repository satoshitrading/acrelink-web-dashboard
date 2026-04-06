import { useEffect, useMemo, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

/**
 * Per-node moistureThresholdVwc from serviceData/sensors for the given node IDs.
 */
export function useSensorsThresholdMap(
  siteId: string | null,
  nodeIds: string[]
): Record<string, number | null | undefined> {
  const [map, setMap] = useState<Record<string, number | null | undefined>>({});

  const nodeIdsKey = useMemo(() => nodeIds.join("|"), [nodeIds]);

  /* eslint-disable react-hooks/exhaustive-deps -- nodeIdsKey tracks nodeIds content */
  useEffect(() => {
    if (!siteId?.trim() || nodeIds.length === 0) {
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
      for (const nid of nodeIds) {
        const row = raw[nid];
        if (!row || row.siteId !== siteId) {
          next[nid] = undefined;
          continue;
        }
        const v = row.moistureThresholdVwc;
        if (v === undefined) next[nid] = undefined;
        else if (v === null) next[nid] = null;
        else {
          const n = Number(v);
          next[nid] = Number.isFinite(n) ? n : undefined;
        }
      }
      setMap(next);
    });

    return () => unsub();
  }, [siteId, nodeIdsKey]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return map;
}
