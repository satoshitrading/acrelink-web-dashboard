import { useEffect, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polygon,
  Popup,
  useMap,
} from "react-leaflet";
import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";
import { useSiteSensorsGps } from "@/hooks/useSiteSensorsGps";
import type { Zone } from "@/types/zone";
import { convexHull, type Point2 } from "@/lib/convex-hull";
import {
  mapNodeStatusCategory,
  MAP_MARKER_COLORS,
} from "@/lib/map-node-status";
import { toNodeFilterValue } from "@/lib/zone-filter-utils";

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 12);
      return;
    }
    const b = new LatLngBounds(positions);
    map.fitBounds(b, { padding: [28, 28], maxZoom: 15 });
  }, [map, positions]);
  return null;
}

function zoneHullLatLngs(
  zone: Zone,
  gpsByNodeId: Record<string, { lat: number; lng: number }>
): [number, number][] | null {
  const pts: Point2[] = [];
  for (const nid of zone.nodeIds) {
    const g = gpsByNodeId[nid];
    if (!g) continue;
    pts.push([g.lat, g.lng] as Point2);
  }
  if (pts.length < 3) return null;
  try {
    const hull = convexHull(pts);
    if (hull.length < 3) return null;
    return hull.map(([lat, lng]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}

export function FieldMapPanel() {
  const {
    userSiteId,
    zones,
    allNodeReadings,
    setZoneFilter,
    zoneSectionLoading,
  } = useDashboard();

  const { gpsByNodeId, loading: gpsLoading } = useSiteSensorsGps(userSiteId);

  const markers = useMemo(() => {
    const out: {
      nodeId: string;
      lat: number;
      lng: number;
      category: ReturnType<typeof mapNodeStatusCategory>;
    }[] = [];
    for (const [nodeId, coord] of Object.entries(gpsByNodeId)) {
      const reading = allNodeReadings[nodeId];
      const category = mapNodeStatusCategory(reading);
      out.push({
        nodeId,
        lat: coord.lat,
        lng: coord.lng,
        category,
      });
    }
    return out;
  }, [gpsByNodeId, allNodeReadings]);

  const hulls = useMemo(() => {
    return zones.map((z) => ({
      zone: z,
      positions: zoneHullLatLngs(z, gpsByNodeId),
    }));
  }, [zones, gpsByNodeId]);

  const fitPositions = useMemo(() => {
    const list: [number, number][] = markers.map((m) => [m.lat, m.lng]);
    for (const h of hulls) {
      if (h.positions) {
        for (const p of h.positions) list.push(p);
      }
    }
    return list;
  }, [markers, hulls]);

  const onMarkerClick = useCallback(
    (nodeId: string) => {
      setZoneFilter(toNodeFilterValue(nodeId));
    },
    [setZoneFilter]
  );

  const onZonePolygonClick = useCallback(
    (zoneId: string) => {
      setZoneFilter(zoneId);
    },
    [setZoneFilter]
  );

  const showMap =
    !zoneSectionLoading &&
    !gpsLoading &&
    userSiteId &&
    (markers.length > 0 || hulls.some((h) => h.positions && h.positions.length > 0));

  return (
    <Card className="border-2 border-border/50 shadow-industrial mb-8 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-display">Field map</CardTitle>
        <p className="text-sm text-muted-foreground">
          Nodes with GPS appear as dots (green ok, yellow warn, red dry, gray
          offline). Zone outlines are convex hulls of node positions. Click a
          node or zone to filter the dashboard.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {!userSiteId || zoneSectionLoading || gpsLoading ? (
          <div className="h-[380px] flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground text-sm">
            Loading map…
          </div>
        ) : !showMap ? (
          <div className="h-[380px] flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground text-sm text-center px-4">
            No GPS coordinates yet for this site. Capture locations on the
            Service page to see nodes on the map.
          </div>
        ) : (
          <div className="h-[380px] w-full rounded-lg overflow-hidden border border-border z-0">
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              className="h-full w-full z-0"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {fitPositions.length > 0 ? (
                <FitBounds positions={fitPositions} />
              ) : null}

              {hulls.map(({ zone, positions }) =>
                positions && positions.length >= 3 ? (
                  <Polygon
                    key={zone.id}
                    positions={positions}
                    pathOptions={{
                      color: zone.color,
                      fillColor: zone.color,
                      fillOpacity: 0.12,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => onZonePolygonClick(zone.id),
                    }}
                  >
                    <Popup>
                      <button
                        type="button"
                        className="font-semibold text-primary underline"
                        onClick={() => onZonePolygonClick(zone.id)}
                      >
                        {zone.name}
                      </button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Filter dashboard to this zone
                      </p>
                    </Popup>
                  </Polygon>
                ) : null
              )}

              {markers.map((m) => (
                <CircleMarker
                  key={m.nodeId}
                  center={[m.lat, m.lng]}
                  radius={9}
                  pathOptions={{
                    color: "#1f2937",
                    weight: 2,
                    fillColor: MAP_MARKER_COLORS[m.category],
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
                      {m.category === "offline"
                        ? "Offline"
                        : `${allNodeReadings[m.nodeId]?.moisture ?? "—"}% · ${allNodeReadings[m.nodeId]?.status ?? ""}`}
                    </p>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        )}

        <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-[#22c55e]" />{" "}
            Ok
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-[#eab308]" />{" "}
            Warn
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-[#ef4444]" />{" "}
            Dry
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-[#6b7280]" />{" "}
            Offline
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
