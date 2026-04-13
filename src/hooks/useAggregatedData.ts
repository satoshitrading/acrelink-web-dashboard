import { useEffect, useState } from "react";
import type { AggregatedSnapshot } from "@/services/aggregationService";
import { subscribeToSiteAggregation } from "@/services/aggregationService";

const empty: AggregatedSnapshot = {
  allNodeReadings: {},
  dailyHistoryByNode: {},
  dailyHistoryByDepth: {},
  siteLatestDateKey: null,
  totalNodeCount: 0,
  onlineNodeCount: 0,
};

/**
 * Live site aggregation — all node readings + daily history (single RTDB subscription).
 */
export function useAggregatedData(siteId: string | null) {
  const [data, setData] = useState<AggregatedSnapshot>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) {
      setData(empty);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeToSiteAggregation(`siteId:${siteId}`, (snap) => {
      setData(snap);
      setLoading(false);
    });

    return () => {
      unsub();
    };
  }, [siteId]);

  return {
    allNodeReadings: data.allNodeReadings,
    dailyHistoryByNode: data.dailyHistoryByNode,
    dailyHistoryByDepth: data.dailyHistoryByDepth,
    siteLatestDateKey: data.siteLatestDateKey,
    totalNodeCount: data.totalNodeCount,
    onlineNodeCount: data.onlineNodeCount,
    loading,
  };
}
