import { useState } from "react";
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
import type { Zone } from "@/types/zone";
import { Trash2, Pencil } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

interface ZoneManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: Zone[];
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (zoneId: string, updates: { name?: string; color?: string }) => Promise<void>;
  onDelete: (zoneId: string) => Promise<void>;
  onAssignNodes?: (zone: Zone) => void;
}

export function ZoneManagementPanel({
  open,
  onOpenChange,
  zones,
  onCreate,
  onUpdate,
  onDelete,
  onAssignNodes,
}: ZoneManagementPanelProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await onCreate(newName.trim(), newColor);
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (z: Zone) => {
    setEditingId(z.id);
    setEditName(z.name);
    setEditColor(z.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      await onUpdate(editingId, { name: editName.trim(), color: editColor });
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
              Create zones, set names and colors, and assign nodes from the list below. Deleting a zone does not remove sensor data — nodes become unassigned.
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
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 ${newColor === c ? "border-foreground ring-2 ring-offset-2" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
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
                          <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`h-7 w-7 rounded-full border-2 ${editColor === c ? "border-foreground" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                                onClick={() => setEditColor(c)}
                              />
                            ))}
                          </div>
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
                              className="h-4 w-4 rounded-full shrink-0"
                              style={{ backgroundColor: z.color }}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{z.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {z.nodeIds.length} node{z.nodeIds.length !== 1 ? "s" : ""}
                              </p>
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
