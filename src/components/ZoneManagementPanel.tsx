import { useMemo, useState } from "react";
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
import type { Zone, ZoneSummary } from "@/types/zone";
import type { CreateZoneInput, UpdateZoneInput } from "@/services/zoneService";
import { useToast } from "@/hooks/use-toast";
import { moistureStatusToChartHex } from "@/lib/moistureStatusPalette";
import { Trash2, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface ZoneManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: Zone[];
  /** Used to show moisture status colors in the list (same semantics as the field map). */
  zoneSummaries: ZoneSummary[];
  onCreate: (input: Omit<CreateZoneInput, "siteId">) => Promise<void>;
  onUpdate: (zoneId: string, updates: UpdateZoneInput) => Promise<void>;
  onDelete: (zoneId: string) => Promise<void>;
  onAssignNodes?: (zone: Zone) => void;
}

export function ZoneManagementPanel({
  open,
  onOpenChange,
  zones,
  zoneSummaries,
  onCreate,
  onUpdate,
  onDelete,
  onAssignNodes,
}: ZoneManagementPanelProps) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [createAsPivot, setCreateAsPivot] = useState(false);
  const [createLat, setCreateLat] = useState("");
  const [createLng, setCreateLng] = useState("");
  const [createInner, setCreateInner] = useState("");
  const [createOuter, setCreateOuter] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const statusHexByZoneId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of zoneSummaries) {
      m[s.id] = moistureStatusToChartHex(s.status);
    }
    return m;
  }, [zoneSummaries]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const payload: Omit<CreateZoneInput, "siteId"> = { name: newName.trim() };

    if (createAsPivot) {
      const lat = Number(createLat.trim());
      const lng = Number(createLng.trim());
      const inner = Number(createInner.trim());
      const outer = Number(createOuter.trim());
      if (
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lng) ||
        lng < -180 ||
        lng > 180
      ) {
        toast({
          title: "Invalid pivot center",
          description: "Enter valid latitude (−90–90) and longitude (−180–180).",
          variant: "destructive",
        });
        return;
      }
      if (!Number.isFinite(inner) || inner < 0) {
        toast({
          title: "Invalid inner radius",
          description: "Inner radius must be a non‑negative number (meters).",
          variant: "destructive",
        });
        return;
      }
      if (!Number.isFinite(outer) || outer <= inner) {
        toast({
          title: "Invalid outer radius",
          description: "Outer radius must be greater than inner (meters).",
          variant: "destructive",
        });
        return;
      }
      payload.isCenterPivot = true;
      payload.centerLat = lat;
      payload.centerLng = lng;
      payload.innerRadiusM = inner;
      payload.outerRadiusM = outer;
    }

    setBusy(true);
    try {
      await onCreate(payload);
      setNewName("");
      setCreateAsPivot(false);
      setCreateLat("");
      setCreateLng("");
      setCreateInner("");
      setCreateOuter("");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (z: Zone) => {
    setEditingId(z.id);
    setEditName(z.name);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      await onUpdate(editingId, {
        name: editName.trim(),
      });
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await onDelete(deleteId);
      setDeleteId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg xl:max-w-screen-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage zones</DialogTitle>
            <DialogDescription>
              Create zones, set names, and assign nodes from the list below. Zone colors on the dashboard reflect live moisture status. Deleting a zone does not remove sensor data — nodes become unassigned.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <Label>New zone</Label>
              <Input
                placeholder="Zone name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The map uses a convex hull of assigned nodes until center pivot is
                configured. Set ring geometry here at creation, or open a zone from the
                list below and edit geometry on its detail page.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="create-pivot"
                  checked={createAsPivot}
                  onCheckedChange={setCreateAsPivot}
                  disabled={busy}
                />
                <Label htmlFor="create-pivot" className="font-normal cursor-pointer">
                  Center pivot — set ring geometry now
                </Label>
              </div>
              {createAsPivot ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="create-lat" className="text-xs">
                      Center latitude
                    </Label>
                    <Input
                      id="create-lat"
                      placeholder="e.g. 41.12"
                      value={createLat}
                      onChange={(e) => setCreateLat(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-lng" className="text-xs">
                      Center longitude
                    </Label>
                    <Input
                      id="create-lng"
                      placeholder="e.g. -98.55"
                      value={createLng}
                      onChange={(e) => setCreateLng(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-inner" className="text-xs">
                      Inner radius (m)
                    </Label>
                    <Input
                      id="create-inner"
                      placeholder="0"
                      value={createInner}
                      onChange={(e) => setCreateInner(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-outer" className="text-xs">
                      Outer radius (m)
                    </Label>
                    <Input
                      id="create-outer"
                      placeholder="e.g. 400"
                      value={createOuter}
                      onChange={(e) => setCreateOuter(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <Button onClick={handleCreate} disabled={busy || !newName.trim()}>
                Create zone
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Your zones</Label>
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No zones yet.</p>
              ) : (
                <ul className="space-y-2">
                  {zones.map((z) => (
                    <li
                      key={z.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3"
                    >
                      {editingId === z.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEdit} disabled={busy}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-4 w-4 rounded-full shrink-0 border border-border/60"
                              style={{
                                backgroundColor:
                                  statusHexByZoneId[z.id] ??
                                  moistureStatusToChartHex("Optimal"),
                              }}
                              title="Moisture status"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{z.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {z.nodeIds.length} node{z.nodeIds.length !== 1 ? "s" : ""}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Switch
                                  id={`pivot-${z.id}`}
                                  checked={!!z.isCenterPivot}
                                  onCheckedChange={async (c) => {
                                    setBusy(true);
                                    try {
                                      if (!c) {
                                        await onUpdate(z.id, {
                                          isCenterPivot: false,
                                          centerLat: null,
                                          centerLng: null,
                                          innerRadiusM: null,
                                          outerRadiusM: null,
                                        });
                                      } else {
                                        await onUpdate(z.id, { isCenterPivot: true });
                                      }
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                  disabled={busy}
                                />
                                <Label
                                  htmlFor={`pivot-${z.id}`}
                                  className="text-xs font-normal cursor-pointer"
                                >
                                  Center pivot (set radii on zone page)
                                </Label>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => startEdit(z)}
                              aria-label="Edit zone"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {onAssignNodes && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => onAssignNodes(z)}
                              >
                                Nodes
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteId(z.id)}
                              aria-label="Delete zone"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete zone?</DialogTitle>
            <DialogDescription>
              This removes the zone only. Sensors stay in Firebase and become unassigned so you can add them to another zone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
