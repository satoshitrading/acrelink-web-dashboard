import { useEffect, useMemo, useCallback, useState, useRef } from "react";
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
import { moistureStatusToChartHex } from "@/lib/moistureStatusPalette";
import { DEFAULT_ZONE_COLOR } from "@/lib/zoneColor";

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;

type BasemapPreset = {
  id: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
  /** False when not aerial imagery (e.g. OSM streets). */
  isSatellite: boolean;
};

function buildBasemapPresets(): BasemapPreset[] {
  return [
    {
      id: "esri-services",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 19,
      isSatellite: true,
    },
    {
      id: "esri-server",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 19,
      isSatellite: true,
    },
    {
      id: "osm-streets",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      maxNativeZoom: 19,
      isSatellite: false,
    },
  ];
}

const TILE_ERRORS_BEFORE_FALLBACK = 12;

/** Tries satellite sources in order; falls back to OSM streets if tiles keep failing (e.g. ERR_CONNECTION_CLOSED to Esri). */
function ResilientBasemapLayer({
  onActivePresetChange,
}: {
  onActivePresetChange?: (preset: BasemapPreset) => void;
}) {
  const presets = useMemo(() => buildBasemapPresets(), []);
  const [index, setIndex] = useState(0);
  const errorStreakRef = useRef(0);
  const preset = presets[Math.min(index, presets.length - 1)];

  useEffect(() => {
    onActivePresetChange?.(preset);
  }, [preset, onActivePresetChange]);

  const bumpFallback = useCallback(() => {
    setIndex((i) => {
      if (i >= presets.length - 1) return i;
      return i + 1;
    });
    errorStreakRef.current = 0;
  }, [presets.length]);

  return (
    <TileLayer
      key={preset.id}
      url={preset.url}
      attribution={preset.attribution}
      maxZoom={preset.maxZoom}
      maxNativeZoom={preset.maxNativeZoom}
      eventHandlers={{
        tileerror: () => {
          errorStreakRef.current += 1;
          if (errorStreakRef.current >= TILE_ERRORS_BEFORE_FALLBACK) {
            bumpFallback();
          }
        },
        tileload: () => {
          errorStreakRef.current = 0;
        },
      }}
    />
  );
}

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

/** Polygon stroke/fill: custom stored color when set; otherwise moisture status (default stored color counts as unset). */
function zonePolygonHex(zone: Zone, moistureStatus: string): string {
  const raw = zone.color?.trim() ?? "";
  if (!raw) return moistureStatusToChartHex(moistureStatus);
  if (raw.toLowerCase() === DEFAULT_ZONE_COLOR.toLowerCase()) {
    return moistureStatusToChartHex(moistureStatus);
  }
  return raw;
}

export function FieldMapPanel() {
  const [activeBasemap, setActiveBasemap] = useState<BasemapPreset | null>(null);

  const {
    userSiteId,
    zones,
    zoneSummaries,
    allNodeReadings,
    setZoneFilter,
    zoneSectionLoading,
    goToZoneTrends,
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

  const zoneStatusById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of zoneSummaries) {
      m[s.id] = s.status;
    }
    return m;
  }, [zoneSummaries]);

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
          offline). Zone outlines use a stored color when customized, otherwise
          moisture status; zone names are shown on the map. Click a node to
          filter the dashboard, or a zone to open its moisture trends.
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
          <div className="space-y-2">
          <div className="h-[380px] w-full rounded-lg overflow-hidden border border-border z-0">
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              className="h-full w-full z-0"
              scrollWheelZoom
            >
              <ResilientBasemapLayer onActivePresetChange={setActiveBasemap} />
              {fitPositions.length > 0 ? (
                <FitBounds positions={fitPositions} />
              ) : null}

              {hulls.map(({ zone, positions }) => {
                const hex = zonePolygonHex(
                  zone,
                  zoneStatusById[zone.id] ?? "Optimal"
                );
                return positions && positions.length >= 3 ? (
                  <Polygon
                    key={zone.id}
                    positions={positions}
                    pathOptions={{
                      color: hex,
                      fillColor: hex,
                      fillOpacity: 0.12,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => onMarkerClick(zone.id),
                    }}
                  >
                    <Popup>
                      <button
                        type="button"
                        className="font-semibold text-primary underline"
                        onClick={() => goToZoneTrends(zone.id)}
                      >
                        {zone.name}
                      </button>
                      <p className="text-xs text-muted-foreground mt-1">
                        View moisture trends for this zone
                      </p>
                    </Popup>
                  </Polygon>
                ) : null;
              })}

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
          {activeBasemap && !activeBasemap.isSatellite ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              Satellite tiles could not be loaded (network or firewall). Showing
              OpenStreetMap as a fallback; your overlays and markers are unchanged.
            </p>
          ) : null}
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
