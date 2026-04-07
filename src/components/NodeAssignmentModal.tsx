import { useEffect, useMemo, useState } from "react";
import { computeZoneSummaries } from "@/services/aggregationService";
import { moistureStatusToChartHex } from "@/lib/moistureStatusPalette";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { NodeReading } from "@/types/zone";
import type { Zone } from "@/types/zone";
import { findZoneContainingNode } from "@/lib/zone-filter-utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface NodeAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: Zone | null;
  allZones: Zone[];
  allNodeReadings: Record<string, NodeReading>;
  onSave: (zoneId: string, nodeIds: string[]) => Promise<void>;
}

/**
 * Available = nodes not in this zone (unassigned or in other zones).
 * Assigned = nodes in this zone.
 */
export function NodeAssignmentModal({
  open,
  onOpenChange,
  zone,
  allZones,
  allNodeReadings,
  onSave,
}: NodeAssignmentModalProps) {
  const [available, setAvailable] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const nodeToGatewayLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const id of Object.keys(allNodeReadings)) {
      const g = allNodeReadings[id]?.gatewayId ?? "";
      m[id] = g.replace(/^gatewayId:/, "");
    }
    return m;
  }, [allNodeReadings]);

  const zoneStatusById = useMemo(() => {
    const summaries = computeZoneSummaries(allZones, allNodeReadings);
    const m: Record<string, string> = {};
    for (const s of summaries) {
      m[s.id] = s.status;
    }
    return m;
  }, [allZones, allNodeReadings]);

  useEffect(() => {
    if (!open || !zone) return;

    const inThisZone = new Set(zone.nodeIds);
    const avail: string[] = [];
    const assign = [...zone.nodeIds];

    for (const id of Object.keys(allNodeReadings)) {
      if (inThisZone.has(id)) continue;
      let inOther = false;
      for (const z of allZones) {
        if (z.id === zone.id) continue;
        if (z.nodeIds.includes(id)) {
          inOther = true;
          break;
        }
      }
      avail.push(id);
      if (inOther) {
        /* still show in available so user can move to this zone */
      }
    }

    setAvailable(avail.sort());
    setAssigned(assign);
  }, [open, zone, allZones, allNodeReadings]);

  const moveToZone = (nodeId: string) => {
    setAvailable((a) => a.filter((x) => x !== nodeId));
    setAssigned((s) => (s.includes(nodeId) ? s : [...s, nodeId]));
  };

  const moveToAvailable = (nodeId: string) => {
    setAssigned((s) => s.filter((x) => x !== nodeId));
    setAvailable((a) => (a.includes(nodeId) ? a : [...a, nodeId].sort()));
  };

  const handleSave = async () => {
    if (!zone) return;
    setBusy(true);
    try {
      await onSave(zone.id, assigned);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  if (!zone) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg xl:max-w-screen-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Assign nodes —{" "}
            <span
              className="font-display"
              style={{
                color: moistureStatusToChartHex(
                  zoneStatusById[zone.id] ?? "Optimal"
                ),
              }}
            >
              {zone.name}
            </span>
          </DialogTitle>
          <DialogDescription>
            Move sensors into this zone. Saving will remove selected nodes from other zones if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[280px]">
          <div className="rounded-lg border border-border p-3 flex flex-col">
            <h4 className="font-semibold mb-2 text-sm">Available</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Not in this zone (unassigned or in other zones)
            </p>
            <ul className="space-y-1 overflow-y-auto max-h-72 flex-1">
              {available.map((id) => {
                const r = allNodeReadings[id];
                const currentZone = findZoneContainingNode(allZones, id);
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs truncate">NodeID: {id}</div>
                      <div className="text-[10px] mt-0.5 truncate">
                        {currentZone ? (
                          <>
                            In{" "}
                            <span
                              className="font-display font-semibold"
                              style={{
                                color: moistureStatusToChartHex(
                                  zoneStatusById[currentZone.id] ?? "Optimal"
                                ),
                              }}
                            >
                              {currentZone.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-red-600">Unassigned</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        GW {nodeToGatewayLabel[id] ?? "—"}
                        {r ? ` · ${r.moisture}%` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => moveToZone(id)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
              {available.length === 0 && (
                <li className="text-sm text-muted-foreground">None</li>
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-primary/40 p-3 flex flex-col">
            <h4 className="font-semibold mb-2 text-sm">In this zone</h4>
            <ul className="space-y-1 overflow-y-auto max-h-64 flex-1">
              {assigned.map((id) => {
                const r = allNodeReadings[id];
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1.5"
                  >
                    <Button size="sm" variant="outline" onClick={() => moveToAvailable(id)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1 text-right">
                      <div className="font-mono text-xs truncate">NodeID: {id}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r ? `${r.moisture}% · ${r.status}` : "—"}
                      </div>
                    </div>
                  </li>
                );
              })}
              {assigned.length === 0 && (
                <li className="text-sm text-muted-foreground">No nodes assigned</li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
