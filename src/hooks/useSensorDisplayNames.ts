import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue, type Unsubscribe } from "firebase/database";
import { getSensorDisplayName } from "@/lib/sensor-display-name";

/**
 * Live map of bare node id → display label for nodes that belong to the site
 * (from serviceData/sensors). Nodes without a row still resolve via getSensorDisplayName fallback in callers.
 */
export function useSensorDisplayNames(
  siteId: string | null | undefined
): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!siteId) {
      setMap({});
      return;
    }
    const sensorsRef = ref(database, "serviceData/sensors");
    let unsub: Unsubscribe | undefined;
    unsub = onValue(
      sensorsRef,
      (snap) => {
        if (!snap.exists()) {
          setMap({});
          return;
        }
        const raw = snap.val() as Record<
          string,
          { siteId?: string; name?: string; label?: string }
        >;
        const next: Record<string, string> = {};
        for (const [id, val] of Object.entries(raw)) {
          if (val.siteId !== siteId) continue;
          next[id] = getSensorDisplayName(val, id);
        }
        setMap(next);
      },
      (err) => {
        console.error("useSensorDisplayNames:", err);
        setMap({});
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, [siteId]);

  return map;
}
