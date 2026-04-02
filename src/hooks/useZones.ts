import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assignNodesToZone as assignNodesToZoneApi,
  createZone as createZoneApi,
  deleteZone as deleteZoneApi,
  subscribeToSiteZones,
  updateZone as updateZoneApi,
  type CreateZoneInput,
  type UpdateZoneInput,
} from "@/services/zoneService";
import { computeZoneSummaries } from "@/services/aggregationService";
import { useAggregatedData } from "@/hooks/useAggregatedData";
import type { Zone } from "@/types/zone";

export function useZones(siteId: string | null) {
  const aggregated = useAggregatedData(siteId);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  useEffect(() => {
    if (!siteId) {
      setZones([]);
      setZonesLoading(false);
      return;
    }

    setZonesLoading(true);
    const unsub = subscribeToSiteZones(siteId, (list) => {
      setZones(list);
      setZonesLoading(false);
    });
    return () => unsub();
  }, [siteId]);

  const zoneSummaries = useMemo(
    () => computeZoneSummaries(zones, aggregated.allNodeReadings),
    [zones, aggregated.allNodeReadings]
  );

  const assignedNodeIds = useMemo(() => {
    const s = new Set<string>();
    for (const z of zones) {
      for (const id of z.nodeIds) s.add(id);
    }
    return s;
  }, [zones]);

  const unassignedNodeIds = useMemo(() => {
    const all = Object.keys(aggregated.allNodeReadings);
    return all.filter((id) => !assignedNodeIds.has(id));
  }, [aggregated.allNodeReadings, assignedNodeIds]);

  const createZone = useCallback(
    async (input: Omit<CreateZoneInput, "siteId">) => {
      if (!siteId) return;
      await createZoneApi({ ...input, siteId });
    },
    [siteId]
  );

  const updateZone = useCallback(
    async (zoneId: string, updates: UpdateZoneInput) => {
      await updateZoneApi(zoneId, updates);
    },
    []
  );

  const deleteZone = useCallback(async (zoneId: string) => {
    await deleteZoneApi(zoneId);
  }, []);

  const assignNodesToZone = useCallback(
    async (zoneId: string, nodeIds: string[]) => {
      if (!siteId) return;
      await assignNodesToZoneApi(zoneId, nodeIds, siteId);
    },
    [siteId]
  );

  return {
    zones,
    zoneSummaries,
    unassignedNodeIds,
    assignedNodeIds,
    assignedNodeIdsSet: assignedNodeIds,
    createZone,
    updateZone,
    deleteZone,
    assignNodesToZone,
    ...aggregated,
    loading: aggregated.loading || zonesLoading,
  };
}
