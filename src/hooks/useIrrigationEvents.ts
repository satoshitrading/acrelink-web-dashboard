import { useEffect, useState } from "react";
import { ref, onValue, off } from "firebase/database";
import { database } from "@/lib/firebase";
import { parseIrrigationEventsSnapshot } from "@/lib/irrigation-metrics";
import type { IrrigationEventRow } from "@/types/irrigation";

/**
 * Subscribe to irrigation_events/{siteId} (all zones).
 */
export function useIrrigationEvents(siteId: string | null) {
  const [eventsByZoneId, setEventsByZoneId] = useState<
    Record<string, IrrigationEventRow[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) {
      setEventsByZoneId({});
      setLoading(false);
      setError(null);
      return;
    }

    const r = ref(database, `irrigation_events/${siteId}`);
    setLoading(true);

    const unsub = onValue(
      r,
      (snap) => {
        if (!snap.exists()) {
          setEventsByZoneId({});
          setLoading(false);
          setError(null);
          return;
        }
        setEventsByZoneId(parseIrrigationEventsSnapshot(snap.val()));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      off(r, "value", unsub);
    };
  }, [siteId]);

  return { loading, error, eventsByZoneId };
}
