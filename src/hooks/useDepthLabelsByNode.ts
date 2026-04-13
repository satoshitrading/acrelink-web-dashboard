import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

/**
 * Per-node depth labels from `serviceData/sensors/{nodeId}/depthLabels` for this site.
 */
export function useDepthLabelsByNode(
  siteId: string | null
): Record<string, Record<string, string>> {
  const [map, setMap] = useState<Record<string, Record<string, string>>>({});

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
      const next: Record<string, Record<string, string>> = {};
      for (const [nodeId, row] of Object.entries(raw)) {
        if (!row || row.siteId !== siteId) continue;
        const dl = row.depthLabels;
        if (!dl || typeof dl !== "object" || Array.isArray(dl)) continue;
        const labels: Record<string, string> = {};
        for (const [k, v] of Object.entries(dl as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) labels[k] = v.trim();
        }
        if (Object.keys(labels).length > 0) next[nodeId] = labels;
      }
      setMap(next);
    });

    return () => unsub();
  }, [siteId]);

  return map;
}
