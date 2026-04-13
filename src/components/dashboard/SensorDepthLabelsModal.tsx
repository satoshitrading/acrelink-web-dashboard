import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  sanitizeDepthLabelsForWrite,
} from "@/lib/depth-label-utils";
import { updateSensorDepthLabels } from "@/services/zoneService";

type DepthLabelRow = { fieldKey: string; label: string };

const DEPTH_LABEL_ROW_KEY = /^(\d+|soil_raw_\d+)$/;

function nextSoilRawFieldKey(rows: DepthLabelRow[]): string {
  let max = -1;
  for (const r of rows) {
    const m = r.fieldKey.match(/^soil_raw_(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
    if (/^\d+$/.test(r.fieldKey)) max = Math.max(max, Number(r.fieldKey));
  }
  return `soil_raw_${max + 1}`;
}

function rowsFromDepthLabels(
  labels: Record<string, string> | undefined
): DepthLabelRow[] {
  const entries = Object.entries(labels ?? {}).filter(([k]) =>
    DEPTH_LABEL_ROW_KEY.test(k)
  );
  if (entries.length === 0) return [{ fieldKey: "soil_raw_0", label: "" }];
  return entries.map(([fieldKey, label]) => ({ fieldKey, label }));
}

export function SensorDepthLabelsModal({
  open,
  onOpenChange,
  nodeIds,
  sensorDisplayNames,
  depthLabelsByNode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeIds: string[];
  sensorDisplayNames: Record<string, string>;
  depthLabelsByNode: Record<string, Record<string, string>>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rowsByNode, setRowsByNode] = useState<Record<string, DepthLabelRow[]>>(
    {}
  );

  useEffect(() => {
    if (!open) return;
    const next: Record<string, DepthLabelRow[]> = {};
    for (const nodeId of nodeIds) {
      next[nodeId] = rowsFromDepthLabels(depthLabelsByNode[nodeId]);
    }
    setRowsByNode(next);
  }, [open, nodeIds, depthLabelsByNode]);

  const canSave = useMemo(() => nodeIds.length > 0 && !busy, [nodeIds, busy]);

  const saveAll = async () => {
    if (!nodeIds.length) return;
    setBusy(true);
    try {
      await Promise.all(
        nodeIds.map(async (nodeId) => {
          const rows = rowsByNode[nodeId] ?? [];
          const raw: Record<string, string> = {};
          for (const row of rows) {
            const k = row.fieldKey.trim();
            const v = row.label.trim();
            if (!k || !v) continue;
            raw[k] = v;
          }
          const sanitized = sanitizeDepthLabelsForWrite(raw);
          await updateSensorDepthLabels(nodeId, sanitized);
        })
      );
      toast({
        title: "Depth labels updated",
        description: "Dashboard legends will refresh automatically.",
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast({
        title: "Unable to save depth labels",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit depth labels</DialogTitle>
          <DialogDescription>
            Labels map packet fields like `soil_raw_0`, `soil_raw_1`, etc. to
            human-readable names in Depth Breakdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {nodeIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Select a zone or node in Depth Breakdown first.
            </p>
          ) : (
            nodeIds.map((nodeId) => {
              const rows = rowsByNode[nodeId] ?? [
                { fieldKey: "soil_raw_0", label: "" },
              ];
              return (
                <div key={nodeId} className="rounded-lg border p-3 space-y-3">
                  <div>
                    <p className="font-semibold text-sm">
                      {sensorDisplayNames[nodeId] ?? nodeId}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {nodeId}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {rows.map((row, idx) => (
                      <div key={`${nodeId}-${idx}`} className="flex gap-2 items-end">
                        <div className="min-w-[180px]">
                          <Label className="text-xs">Field key</Label>
                          <Input
                            className="font-mono text-xs"
                            placeholder="soil_raw_0"
                            value={row.fieldKey}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRowsByNode((prev) => ({
                                ...prev,
                                [nodeId]: (prev[nodeId] ?? rows).map((r, i) =>
                                  i === idx ? { ...r, fieldKey: v } : r
                                ),
                              }));
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Label</Label>
                          <Input
                            placeholder="e.g. 6 inches"
                            value={row.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRowsByNode((prev) => ({
                                ...prev,
                                [nodeId]: (prev[nodeId] ?? rows).map((r, i) =>
                                  i === idx ? { ...r, label: v } : r
                                ),
                              }));
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={rows.length <= 1}
                          onClick={() =>
                            setRowsByNode((prev) => ({
                              ...prev,
                              [nodeId]: (prev[nodeId] ?? rows).filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRowsByNode((prev) => {
                          const current = prev[nodeId] ?? rows;
                          return {
                            ...prev,
                            [nodeId]: [
                              ...current,
                              {
                                fieldKey: nextSoilRawFieldKey(current),
                                label: "",
                              },
                            ],
                          };
                        })
                      }
                    >
                      Add depth field
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={saveAll} disabled={!canSave}>
            {busy ? "Saving..." : "Save labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

