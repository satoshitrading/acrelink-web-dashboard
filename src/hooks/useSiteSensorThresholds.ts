import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

function parseThreshold(
  v: unknown
): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Per-node warning (`moistureThresholdVwc`) and optional critical (`moistureCriticalVwc`) VWC %.
 */
export function useSiteSensorThresholds(siteId: string | null): {
  warn: Record<string, number | null | undefined>;
  crit: Record<string, number | null | undefined>;
} {
  const [warn, setWarn] = useState<Record<string, number | null | undefined>>({});
  const [crit, setCrit] = useState<Record<string, number | null | undefined>>({});

  useEffect(() => {
    if (!siteId?.trim()) {
      setWarn({});
      setCrit({});
      return;
    }

    const sensorsRef = ref(database, "serviceData/sensors");
    const unsub = onValue(sensorsRef, (snap) => {
      if (!snap.exists()) {
        setWarn({});
        setCrit({});
        return;
      }
      const raw = snap.val() as Record<string, Record<string, unknown>>;
      const nextW: Record<string, number | null | undefined> = {};
      const nextC: Record<string, number | null | undefined> = {};
      for (const [nodeId, row] of Object.entries(raw)) {
        if (!row || row.siteId !== siteId) continue;
        nextW[nodeId] = parseThreshold(row.moistureThresholdVwc);
        nextC[nodeId] = parseThreshold(row.moistureCriticalVwc);
      }
      setWarn(nextW);
      setCrit(nextC);
    });

    return () => unsub();
  }, [siteId]);

  return { warn, crit };
}
