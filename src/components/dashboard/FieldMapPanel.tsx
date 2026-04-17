import { useMemo, useCallback, useState } from "react";
import {
  MapContainer,
  CircleMarker,
  Polygon,
  Popup,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  PANE_ZONES,
  PANE_NODES,
  MapInteractionPanes,
  ResilientBasemapLayer,
  FitBounds,
  LocateMeMapControl,
  type BasemapPreset,
} from "@/components/map/fieldMapMapShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useSiteSensorsGps } from "@/hooks/useSiteSensorsGps";
import type { Zone } from "@/types/zone";
import { mapNodeMarkerFillHex } from "@/lib/map-node-status";
import { toNodeFilterValue, findZoneContainingNode } from "@/lib/zone-filter-utils";
import { moistureStatusToChartHex } from "@/lib/moistureStatusPalette";
import { DEFAULT_ZONE_COLOR } from "@/lib/zoneColor";
import {
  getZoneMapPositions,
  zoneMapPositionsRenderable,
  flattenZoneMapPositionsToLatLngs,
  siteZonesToGeoJSONFeatureCollection,
  downloadGeoJSONObject,
  isNodeInZoneGeometry,
  haversineDistanceMeters,
  pointInPolygonRing,
  type ZoneMapPositions,
} from "@/lib/zone-geometry";

/** Polygon stroke/fill: custom stored color when set; otherwise moisture status (default stored color counts as unset). */
function zonePolygonHex(zone: Zone, moistureStatus: string): string {
  const raw = zone.color?.trim() ?? "";
  if (!raw) return moistureStatusToChartHex(moistureStatus);
  if (raw.toLowerCase() === DEFAULT_ZONE_COLOR.toLowerCase()) {
    return moistureStatusToChartHex(moistureStatus);
  }
  return raw;
}

function zoneContainsPoint(
  zone: Zone,
  positions: ZoneMapPositions,
  lat: number,
  lng: number
): boolean {
  if (
    zone.isCenterPivot &&
    zone.centerLat != null &&
    zone.centerLng != null &&
    zone.innerRadiusM != null &&
    zone.outerRadiusM != null
  ) {
    const d = haversineDistanceMeters(zone.centerLat, zone.centerLng, lat, lng);
    return d >= zone.innerRadiusM && d <= zone.outerRadiusM;
  }
  if (Array.isArray(positions[0]) && typeof positions[0][0] === "number") {
    return pointInPolygonRing(lat, lng, positions as [number, number][]);
  }
  const [outer, inner] = positions as [[number, number][], [number, number][]];
  return pointInPolygonRing(lat, lng, outer) && !pointInPolygonRing(lat, lng, inner);
}

function polygonRingArea(ring: [number, number][]): number {
  if (ring.length < 3) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1];
    const yi = ring[i][0];
    const xj = ring[j][1];
    const yj = ring[j][0];
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

function zoneShapePriorityArea(zone: Zone, positions: ZoneMapPositions): number {
  if (zone.isCenterPivot && zone.outerRadiusM != null && zone.innerRadiusM != null) {
    return Math.PI * (zone.outerRadiusM ** 2 - zone.innerRadiusM ** 2);
  }
  if (Array.isArray(positions[0]) && typeof positions[0][0] === "number") {
    return polygonRingArea(positions as [number, number][]);
  }
  const [outer] = positions as [[number, number][], [number, number][]];
  return polygonRingArea(outer);
}

function pivotRingThickness(zone: Zone): number {
  if (zone.outerRadiusM == null || zone.innerRadiusM == null) {
    return Number.POSITIVE_INFINITY;
  }
  return zone.outerRadiusM - zone.innerRadiusM;
}

export function FieldMapPanel() {
  const [activeBasemap, setActiveBasemap] = useState<BasemapPreset | null>(null);
  const [newZoneDialogOpen, setNewZoneDialogOpen] = useState(false);
  const [newZoneForNodeId, setNewZoneForNodeId] = useState<string | null>(null);
  const [newZoneNameInput, setNewZoneNameInput] = useState("");
  const [assignBusyNodeId, setAssignBusyNodeId] = useState<string | null>(null);
  const [resolvedPopupZoneId, setResolvedPopupZoneId] = useState<string | null>(null);
  const [resolvedPopupLatLng, setResolvedPopupLatLng] = useState<
    [number, number] | null
  >(null);

  const {
    userSiteId,
    zones,
    zoneSummaries,
    allNodeReadings,
    setZoneFilter,
    zoneSectionLoading,
    goToZoneTrends,
    assignNodesToZone,
    createZone,
  } = useDashboard();

  const { gpsByNodeId, nodeExportByNodeId, loading: gpsLoading } = useSiteSensorsGps(userSiteId);

  const markers = useMemo(() => {
    const out: {
      nodeId: string;
      lat: number;
      lng: number;
      fillHex: string;
    }[] = [];
    for (const [nodeId, coord] of Object.entries(gpsByNodeId)) {
      const reading = allNodeReadings[nodeId];
      const fillHex = mapNodeMarkerFillHex(reading);
      out.push({
        nodeId,
        lat: coord.lat,
        lng: coord.lng,
        fillHex,
      });
    }
    return out;
  }, [gpsByNodeId, allNodeReadings]);

  const zoneLayers = useMemo(() => {
    return zones.map((z) => {
      const positions = getZoneMapPositions(z, gpsByNodeId);
      return {
        zone: z,
        positions,
        renderable: zoneMapPositionsRenderable(positions),
      };
    });
  }, [zones, gpsByNodeId]);

  const zoneStatusById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of zoneSummaries) {
      m[s.id] = s.status;
    }
    return m;
  }, [zoneSummaries]);
  const resolvedPopupZone = useMemo(
    () => zones.find((z) => z.id === resolvedPopupZoneId) ?? null,
    [zones, resolvedPopupZoneId]
  );

  const fitPositions = useMemo(() => {
    const list: [number, number][] = markers.map((m) => [m.lat, m.lng]);
    for (const l of zoneLayers) {
      if (!l.renderable || !l.positions) continue;
      for (const p of flattenZoneMapPositionsToLatLngs(l.positions)) {
        list.push(p);
      }
    }
    return list;
  }, [markers, zoneLayers]);

  const onMarkerClick = useCallback(
    (nodeId: string) => {
      setZoneFilter(toNodeFilterValue(nodeId));
    },
    [setZoneFilter]
  );

  const onZonePolygonClick = useCallback(
    (zoneId: string, lat?: number, lng?: number) => {
      if (lat == null || lng == null) {
        setZoneFilter(zoneId);
        setResolvedPopupZoneId(zoneId);
        setResolvedPopupLatLng(null);
        return;
      }

      const containing = zoneLayers.filter((l) => {
        if (!l.renderable || !l.positions) return false;
        return zoneContainsPoint(l.zone, l.positions, lat, lng);
      });

      if (containing.length === 0) {
        setZoneFilter(zoneId);
        setResolvedPopupZoneId(zoneId);
        setResolvedPopupLatLng([lat, lng]);
        return;
      }

      containing.sort((a, b) => {
        if (!!a.zone.isCenterPivot !== !!b.zone.isCenterPivot) {
          return a.zone.isCenterPivot ? -1 : 1;
        }

        if (a.zone.isCenterPivot && b.zone.isCenterPivot) {
          if ((a.zone.outerRadiusM ?? Infinity) !== (b.zone.outerRadiusM ?? Infinity)) {
            return (a.zone.outerRadiusM ?? Infinity) - (b.zone.outerRadiusM ?? Infinity);
          }
          if ((a.zone.innerRadiusM ?? -Infinity) !== (b.zone.innerRadiusM ?? -Infinity)) {
            return (b.zone.innerRadiusM ?? -Infinity) - (a.zone.innerRadiusM ?? -Infinity);
          }
          const thicknessA = pivotRingThickness(a.zone);
          const thicknessB = pivotRingThickness(b.zone);
          if (thicknessA !== thicknessB) return thicknessA - thicknessB;
        }

        const areaA = zoneShapePriorityArea(a.zone, a.positions!);
        const areaB = zoneShapePriorityArea(b.zone, b.positions!);
        if (areaA !== areaB) return areaA - areaB;
        if (a.zone.id === zoneId) return -1;
        if (b.zone.id === zoneId) return 1;
        return a.zone.id.localeCompare(b.zone.id);
      });

      const winnerZoneId = containing[0].zone.id;
      setZoneFilter(winnerZoneId);
      setResolvedPopupZoneId(winnerZoneId);
      setResolvedPopupLatLng([lat, lng]);
    },
    [setZoneFilter, zoneLayers]
  );

  const handleAssignToZone = useCallback(
    async (zoneId: string, nodeId: string) => {
      if (!userSiteId?.trim()) {
        toast.error("No site selected.");
        return;
      }
      const target = zones.find((z) => z.id === zoneId);
      if (!target) return;

      const positions = getZoneMapPositions(target, gpsByNodeId);
      if (zoneMapPositionsRenderable(positions)) {
        if (!isNodeInZoneGeometry(target, nodeId, gpsByNodeId)) {
          toast.error(
            "That sensor’s GPS is outside this zone’s map shape. Center‑pivot zones use distance from center (inner–outer radius); other zones use the convex hull. Adjust geometry or GPS, or pick another zone."
          );
          return;
        }
      }

      setAssignBusyNodeId(nodeId);
      try {
        const merged = [...new Set([...target.nodeIds, nodeId])];
        await assignNodesToZone(zoneId, merged);
        toast.success(`Assigned ${nodeId} to ${target.name}`);
      } catch (e) {
        console.error(e);
        toast.error("Could not assign node to zone.");
      } finally {
        setAssignBusyNodeId(null);
      }
    },
    [userSiteId, zones, gpsByNodeId, assignNodesToZone]
  );

  const openNewZoneDialog = useCallback((nodeId: string) => {
    setNewZoneForNodeId(nodeId);
    setNewZoneNameInput("");
    setNewZoneDialogOpen(true);
  }, []);

  const handleCreateZoneAndAssign = useCallback(async () => {
    const name = newZoneNameInput.trim();
    if (!name || !newZoneForNodeId || !userSiteId?.trim()) return;
    setAssignBusyNodeId(newZoneForNodeId);
    try {
      const newId = await createZone({ name });
      if (!newId) {
        toast.error("Could not create zone.");
        return;
      }
      await assignNodesToZone(newId, [newZoneForNodeId]);
      toast.success(`Created “${name}” and assigned ${newZoneForNodeId}`);
      setNewZoneDialogOpen(false);
      setNewZoneForNodeId(null);
      setNewZoneNameInput("");
    } catch (e) {
      console.error(e);
      toast.error("Could not create zone or assign node.");
    } finally {
      setAssignBusyNodeId(null);
    }
  }, [
    newZoneNameInput,
    newZoneForNodeId,
    userSiteId,
    createZone,
    assignNodesToZone,
  ]);

  const showMap =
    !zoneSectionLoading &&
    !gpsLoading &&
    userSiteId &&
    (markers.length > 0 || zoneLayers.some((l) => l.renderable));

  const handleDownloadAllZonesGeoJSON = useCallback(() => {
    if (!userSiteId?.trim() || zones.length === 0) return;
    const fc = siteZonesToGeoJSONFeatureCollection(
      zones,
      gpsByNodeId,
      nodeExportByNodeId
    );
    const safe = userSiteId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "site";
    downloadGeoJSONObject(`zones-${safe}`, fc);
    toast.success("GeoJSON download started (zone polygons + node points).");
  }, [userSiteId, zones, gpsByNodeId, nodeExportByNodeId]);

  return (
    <Card className="border-2 border-border/50 shadow-industrial mb-8 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-display">Field map</CardTitle>
        <p className="text-sm text-muted-foreground">
          Dots use the same moisture colors as charts (e.g. Wet is blue). Zone
          outlines reflect moisture status (or a legacy custom color if set).
          Click a zone outline to filter the dashboard by that zone, or a node to
          filter by that sensor. Use the View control and choose &quot;All zones
          (aggregated)&quot; to clear the filter. Open a zone popup to jump to
          moisture trends on the Analytics tab. Use Locate me (top-right on the
          map) to center on your GPS position.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {!userSiteId || zoneSectionLoading || gpsLoading ? (
          <div className="h-[620px] flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground text-sm">
            Loading map…
          </div>
        ) : !showMap ? (
          <div className="h-[620px] flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground text-sm text-center px-4">
            No GPS coordinates yet for this site and no drawable zone geometry.
            Capture locations on the Service page or configure a center-pivot
            zone on the zone page.
          </div>
        ) : (
          <div className="space-y-2">
          <div className="h-[620px] w-full rounded-lg overflow-hidden border border-border z-0">
            <MapContainer
              center={DEFAULT_MAP_CENTER}
              zoom={DEFAULT_MAP_ZOOM}
              className="h-full w-full z-0"
              scrollWheelZoom
            >
              <MapInteractionPanes />
              <ResilientBasemapLayer onActivePresetChange={setActiveBasemap} />
              <LocateMeMapControl />
              {fitPositions.length > 0 ? (
                <FitBounds positions={fitPositions} />
              ) : null}

              {zoneLayers.map(({ zone, positions, renderable }) => {
                const hex = zonePolygonHex(
                  zone,
                  zoneStatusById[zone.id] ?? "Optimal"
                );
                if (!renderable || !positions) return null;
                return (
                  <Polygon
                    key={zone.id}
                    pane={PANE_ZONES}
                    positions={positions as LatLngExpression[] | LatLngExpression[][]}
                    pathOptions={{
                      color: hex,
                      fillColor: hex,
                      fillOpacity: 0.12,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: (e) => onZonePolygonClick(zone.id, e.latlng.lat, e.latlng.lng),
                    }}
                  >
                    <Popup>
                      <button
                        type="button"
                        className="font-semibold text-primary underline"
                        onClick={() =>
                          goToZoneTrends(resolvedPopupZone?.id ?? zone.id)
                        }
                      >
                        {resolvedPopupLatLng && resolvedPopupZone
                          ? resolvedPopupZone.name
                          : zone.name}
                      </button>
                      <p className="text-xs text-muted-foreground mt-1">
                        View moisture trends for this zone
                      </p>
                    </Popup>
                  </Polygon>
                );
              })}

              {markers.map((m) => {
                const reading = allNodeReadings[m.nodeId];
                const offline = !reading?.online;
                const currentZone = findZoneContainingNode(zones, m.nodeId);
                return (
                  <CircleMarker
                    key={m.nodeId}
                    pane={PANE_NODES}
                    center={[m.lat, m.lng]}
                    radius={9}
                    pathOptions={{
                      color: "#1f2937",
                      weight: 2,
                      fillColor: m.fillHex,
                      fillOpacity: 0.95,
                    }}
                    eventHandlers={{
                      click: () => onMarkerClick(m.nodeId),
                    }}
                  >
                    <Popup>
                      <button
                        type="button"
                        className="font-mono text-xs font-semibold text-primary underline"
                        onClick={() => onMarkerClick(m.nodeId)}
                      >
                        {m.nodeId}
                      </button>
                      <p className="text-xs mt-1">
                        {offline
                          ? "Offline"
                          : `${reading?.moisture ?? "—"}% · ${reading?.status ?? ""}`}
                      </p>
                      {currentZone ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Zone: {currentZone.name}
                        </p>
                      ) : null}
                      <div className="mt-2 pt-2 border-t border-border space-y-1.5 max-h-40 overflow-y-auto">
                        <p className="text-xs font-medium text-foreground">
                          Assign to zone
                        </p>
                        {zones.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            No zones yet — create one below.
                          </p>
                        ) : (
                          zones.map((z) => (
                            <Button
                              key={z.id}
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="w-full justify-start text-xs h-8"
                              disabled={
                                !userSiteId ||
                                assignBusyNodeId === m.nodeId ||
                                z.nodeIds.includes(m.nodeId)
                              }
                              onClick={() => handleAssignToZone(z.id, m.nodeId)}
                            >
                              {z.name}
                              {z.nodeIds.includes(m.nodeId) ? " (current)" : ""}
                            </Button>
                          ))
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-xs h-8"
                          disabled={!userSiteId || assignBusyNodeId === m.nodeId}
                          onClick={() => openNewZoneDialog(m.nodeId)}
                        >
                          Create new zone…
                        </Button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          {activeBasemap && !activeBasemap.isSatellite ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              Satellite tiles could not be loaded (network or firewall). Showing
              OpenStreetMap as a fallback; your overlays and markers are unchanged.
            </p>
          ) : null}
          </div>
        )}

        {userSiteId && zones.length > 0 && !zoneSectionLoading ? (
          <div className="flex justify-end mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadAllZonesGeoJSON}
            >
              <Download className="h-4 w-4 mr-2" />
              Download all zones (GeoJSON)
            </Button>
          </div>
        ) : null}

        <Dialog
          open={newZoneDialogOpen}
          onOpenChange={(o) => {
            setNewZoneDialogOpen(o);
            if (!o) {
              setNewZoneForNodeId(null);
              setNewZoneNameInput("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New zone</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="map-new-zone-name">Zone name</Label>
              <Input
                id="map-new-zone-name"
                value={newZoneNameInput}
                onChange={(e) => setNewZoneNameInput(e.target.value)}
                placeholder="e.g. North pivot"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateZoneAndAssign();
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewZoneDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateZoneAndAssign()}
                disabled={
                  !newZoneNameInput.trim() ||
                  assignBusyNodeId !== null ||
                  !newZoneForNodeId
                }
              >
                Create and assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: moistureStatusToChartHex("Optimal") }}
            />{" "}
            Optimal
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: moistureStatusToChartHex("Wet") }}
            />{" "}
            Wet
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: moistureStatusToChartHex("Dry") }}
            />{" "}
            Dry
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: moistureStatusToChartHex("Critical: Dry") }}
            />{" "}
            Critical dry / saturated
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: moistureStatusToChartHex("Offline") }}
            />{" "}
            Offline
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: moistureStatusToChartHex("") }}
            />{" "}
            Other statuses
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
