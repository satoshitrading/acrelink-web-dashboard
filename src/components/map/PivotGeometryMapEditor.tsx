import { useMemo, useCallback, useEffect, useState } from "react";
import {
  MapContainer,
  Circle,
  CircleMarker,
  Marker,
  Polygon,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  PANE_ZONES,
  PANE_NODES,
  MapInteractionPanes,
  ResilientBasemapLayer,
  FitBounds,
  LocateMeMapControl,
  MapInvalidateOnMount,
  type BasemapPreset,
} from "@/components/map/fieldMapMapShell";
import {
  buildAnnulusPolygonPositions,
  haversineDistanceMeters,
  destinationPointMeters,
} from "@/lib/zone-geometry";
import {
  clampPivotRadii,
  PIVOT_RADIUS_MAX_M,
  PIVOT_RADIUS_MIN_GAP_M,
} from "@/lib/pivot-geometry";

/**
 * Radix Slider only stays in sync with controlled `value` when it lies on the
 * `min + n * step` grid. Arbitrary typed meters (e.g. 837 with step 5) left the
 * thumb stuck while `aria-valuenow` showed 0.
 */
function sliderRadiusForControl(meters: number, max: number): number {
  if (!Number.isFinite(meters) || meters < 0) return 0;
  const rounded = Math.round(meters);
  return Math.min(max, Math.max(0, rounded));
}

function formatRadiusMeters(n: number): string {
  return typeof n === "number" && Number.isFinite(n) ? String(Math.round(n)) : "—";
}

/** Leaflet requires finite lat/lng within geographic bounds. */
function isValidLeafletLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function ringPointsAreFinite(ring: [number, number][]): boolean {
  return ring.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

const PANE_PIVOT_EDIT = "acrelinkPivotEdit";

/** Fixed bearing from pivot center for radius handles (degrees clockwise from north). */
const RADIUS_HANDLE_BEARING = 0;

function PivotEditorTopPane() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane(PANE_PIVOT_EDIT)) {
      const p = map.createPane(PANE_PIVOT_EDIT);
      p.style.zIndex = "700";
    }
  }, [map]);
  return null;
}

function MapCrosshairWhenPlacing({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const prev = el.style.cursor;
    el.style.cursor = active ? "crosshair" : "";
    return () => {
      el.style.cursor = prev;
    };
  }, [map, active]);
  return null;
}

/** Leaflet sometimes skips sizing vector layers until the map is invalidated after overlays appear. */
function InvalidateMapWhenPivotOverlaysChange({
  pivotOverlayReady,
  innerM,
  outerM,
}: {
  pivotOverlayReady: boolean;
  innerM: number;
  outerM: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!pivotOverlayReady) return;
    const id = requestAnimationFrame(() => {
      map.invalidateSize();
    });
    return () => cancelAnimationFrame(id);
  }, [map, pivotOverlayReady, innerM, outerM]);
  return null;
}

function PlaceCenterOnClick({
  active,
  onPlaced,
}: {
  active: boolean;
  onPlaced: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (!active) return;
      const { lat, lng } = e.latlng;
      if (!isValidLeafletLatLng(lat, lng)) return;
      onPlaced(lat, lng);
    },
  });
  return null;
}

export type PivotGeometryDraft = {
  centerLat: number | null;
  centerLng: number | null;
  innerRadiusM: number;
  outerRadiusM: number;
};

const centerDivIcon = L.divIcon({
  className: "acrelink-leaflet-div-icon",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#1d4ed8;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const innerHandleIcon = L.divIcon({
  className: "acrelink-leaflet-div-icon",
  html: '<div style="width:12px;height:12px;border-radius:2px;background:#f59e0b;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)" title="Inner radius"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const outerHandleIcon = L.divIcon({
  className: "acrelink-leaflet-div-icon",
  html: '<div style="width:12px;height:12px;border-radius:2px;background:#16a34a;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)" title="Outer radius"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export function PivotGeometryMapEditor({
  draft,
  onDraftChange,
  onPivotCenterFirstPlaced,
  gpsByNodeId,
  zoneNodeIds,
  previewRingColor = "#2563eb",
  radiusControlsEpoch = 0,
}: {
  draft: PivotGeometryDraft;
  onDraftChange: (patch: Partial<PivotGeometryDraft>) => void;
  /** Called once when the user places a pivot center on the map and there was no center before (keeps radius sliders in sync). */
  onPivotCenterFirstPlaced?: () => void;
  gpsByNodeId: Record<string, { lat: number; lng: number }>;
  zoneNodeIds: string[];
  previewRingColor?: string;
  /** When Advanced radius fields edit, parent bumps this so Radix sliders remount and stay in sync. */
  radiusControlsEpoch?: number;
}) {
  const [placingCenter, setPlacingCenter] = useState(false);
  const [activeBasemap, setActiveBasemap] = useState<BasemapPreset | null>(null);

  const zoneNodeSet = useMemo(() => new Set(zoneNodeIds), [zoneNodeIds]);

  const hasCenter =
    draft.centerLat != null &&
    draft.centerLng != null &&
    Number.isFinite(draft.centerLat) &&
    Number.isFinite(draft.centerLng);

  const { inner: innerRadiusM, outer: outerRadiusM } = useMemo(
    () => clampPivotRadii(draft.innerRadiusM, draft.outerRadiusM),
    [draft.innerRadiusM, draft.outerRadiusM]
  );

  /** Only mount Circle/Marker/Polygon pivot overlays when Leaflet-safe (avoids NaN LatLng / NaN radius). */
  const pivotOverlayReady = useMemo(() => {
    if (draft.centerLat == null || draft.centerLng == null) return false;
    if (!isValidLeafletLatLng(draft.centerLat, draft.centerLng)) return false;
    if (!Number.isFinite(innerRadiusM) || !Number.isFinite(outerRadiusM)) return false;
    if (innerRadiusM < 0 || outerRadiusM < 0) return false;
    return true;
  }, [draft.centerLat, draft.centerLng, innerRadiusM, outerRadiusM]);

  const circleInnerM = pivotOverlayReady ? Math.max(0, innerRadiusM) : 0;
  const circleOuterM = pivotOverlayReady ? Math.max(0, outerRadiusM) : 0;

  const handlePlaced = useCallback(
    (lat: number, lng: number) => {
      if (!isValidLeafletLatLng(lat, lng)) return;
      if (!hasCenter) onPivotCenterFirstPlaced?.();
      onDraftChange({ centerLat: lat, centerLng: lng });
      setPlacingCenter(false);
    },
    [hasCenter, onDraftChange, onPivotCenterFirstPlaced]
  );

  const onInnerSlider = useCallback(
    (vals: number[]) => {
      const raw = vals[0];
      const v = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      const c = clampPivotRadii(v, draft.outerRadiusM);
      onDraftChange({ innerRadiusM: c.inner, outerRadiusM: c.outer });
    },
    [onDraftChange, draft.outerRadiusM]
  );

  const onOuterSlider = useCallback(
    (vals: number[]) => {
      const raw = vals[0];
      const v = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      const c = clampPivotRadii(draft.innerRadiusM, v);
      onDraftChange({ innerRadiusM: c.inner, outerRadiusM: c.outer });
    },
    [onDraftChange, draft.innerRadiusM]
  );

  const onInnerHandleDragEnd = useCallback(
    (lat: number, lng: number) => {
      if (!hasCenter || draft.centerLat == null || draft.centerLng == null) return;
      const dist = haversineDistanceMeters(draft.centerLat, draft.centerLng, lat, lng);
      if (!Number.isFinite(dist)) return;
      const c = clampPivotRadii(dist, outerRadiusM);
      onDraftChange({ innerRadiusM: c.inner, outerRadiusM: c.outer });
    },
    [hasCenter, draft.centerLat, draft.centerLng, outerRadiusM, onDraftChange]
  );

  const onOuterHandleDragEnd = useCallback(
    (lat: number, lng: number) => {
      if (!hasCenter || draft.centerLat == null || draft.centerLng == null) return;
      const dist = haversineDistanceMeters(draft.centerLat, draft.centerLng, lat, lng);
      if (!Number.isFinite(dist)) return;
      const c = clampPivotRadii(innerRadiusM, dist);
      onDraftChange({ innerRadiusM: c.inner, outerRadiusM: c.outer });
    },
    [hasCenter, draft.centerLat, draft.centerLng, innerRadiusM, onDraftChange]
  );

  const annulus = useMemo(() => {
    if (!pivotOverlayReady || draft.centerLat == null || draft.centerLng == null) return null;
    const rings = buildAnnulusPolygonPositions(
      draft.centerLat,
      draft.centerLng,
      innerRadiusM,
      outerRadiusM
    );
    const [outer, inner] = rings;
    if (!ringPointsAreFinite(outer) || !ringPointsAreFinite(inner)) return null;
    return rings;
  }, [pivotOverlayReady, draft.centerLat, draft.centerLng, innerRadiusM, outerRadiusM]);

  const innerHandlePos = useMemo((): [number, number] | null => {
    if (!pivotOverlayReady || draft.centerLat == null || draft.centerLng == null) return null;
    if (!Number.isFinite(innerRadiusM) || innerRadiusM <= 0) return null;
    const p = destinationPointMeters(
      draft.centerLat,
      draft.centerLng,
      RADIUS_HANDLE_BEARING,
      innerRadiusM
    );
    return isValidLeafletLatLng(p[0], p[1]) ? p : null;
  }, [pivotOverlayReady, draft.centerLat, draft.centerLng, innerRadiusM]);

  const outerHandlePos = useMemo((): [number, number] | null => {
    if (!pivotOverlayReady || draft.centerLat == null || draft.centerLng == null) return null;
    if (!Number.isFinite(outerRadiusM) || outerRadiusM < 0) return null;
    const p = destinationPointMeters(
      draft.centerLat,
      draft.centerLng,
      RADIUS_HANDLE_BEARING,
      outerRadiusM
    );
    return isValidLeafletLatLng(p[0], p[1]) ? p : null;
  }, [pivotOverlayReady, draft.centerLat, draft.centerLng, outerRadiusM]);

  const fitPositions = useMemo(() => {
    const list: [number, number][] = [];
    for (const g of Object.values(gpsByNodeId)) {
      if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) continue;
      list.push([g.lat, g.lng]);
    }
    if (annulus) {
      const [outer, inner] = annulus;
      for (const p of outer) {
        if (Number.isFinite(p[0]) && Number.isFinite(p[1])) list.push([p[0], p[1]]);
      }
      for (const p of inner) {
        if (Number.isFinite(p[0]) && Number.isFinite(p[1])) list.push([p[0], p[1]]);
      }
    }
    if (list.length === 0) return [DEFAULT_MAP_CENTER] as [number, number][];
    return list;
  }, [gpsByNodeId, annulus]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={placingCenter ? "default" : "secondary"}
          onClick={() => setPlacingCenter((p) => !p)}
        >
          {placingCenter ? "Click the map to place center…" : "Set center on map"}
        </Button>
        {placingCenter ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPlacingCenter(false)}>
            Cancel
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Drag the blue dot to fine‑tune. Orange / green squares adjust inner and outer radius.
        </p>
      </div>

      <div className="h-[380px] w-full rounded-lg overflow-hidden border border-border z-0">
        <MapContainer
          center={DEFAULT_MAP_CENTER}
          zoom={DEFAULT_MAP_ZOOM}
          className="h-full w-full z-0"
          scrollWheelZoom
        >
          <MapInvalidateOnMount />
          <MapInteractionPanes />
          <PivotEditorTopPane />
          <ResilientBasemapLayer onActivePresetChange={setActiveBasemap} />
          <LocateMeMapControl />
          <FitBounds positions={fitPositions} />
          <MapCrosshairWhenPlacing active={placingCenter} />
          <PlaceCenterOnClick active={placingCenter} onPlaced={handlePlaced} />
          <InvalidateMapWhenPivotOverlaysChange
            pivotOverlayReady={pivotOverlayReady}
            innerM={innerRadiusM}
            outerM={outerRadiusM}
          />

          {Object.entries(gpsByNodeId).map(([nodeId, g]) => {
            if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return null;
            return (
            <CircleMarker
              key={nodeId}
              pane={PANE_NODES}
              center={[g.lat, g.lng]}
              radius={zoneNodeSet.has(nodeId) ? 10 : 7}
              pathOptions={{
                color: zoneNodeSet.has(nodeId) ? "#1d4ed8" : "#4b5563",
                weight: zoneNodeSet.has(nodeId) ? 3 : 2,
                fillColor: zoneNodeSet.has(nodeId) ? "#93c5fd" : "#9ca3af",
                fillOpacity: 0.85,
              }}
            />
            );
          })}

          {annulus ? (
            <Polygon
              pane={PANE_ZONES}
              positions={annulus as LatLngExpression[] | LatLngExpression[][]}
              pathOptions={{
                color: previewRingColor,
                fillColor: previewRingColor,
                fillOpacity: 0.15,
                weight: 2,
              }}
            />
          ) : null}

          {pivotOverlayReady && draft.centerLat != null && draft.centerLng != null ? (
            <>
              {circleInnerM > 0 ? (
                <Circle
                  key={`pivot-inner-${circleInnerM}`}
                  pane={PANE_PIVOT_EDIT}
                  center={[draft.centerLat, draft.centerLng]}
                  radius={circleInnerM}
                  pathOptions={{
                    color: "#f59e0b",
                    weight: 2,
                    dashArray: "6 6",
                    fillOpacity: 0,
                  }}
                />
              ) : null}
              <Circle
                key={`pivot-outer-${circleOuterM}`}
                pane={PANE_PIVOT_EDIT}
                center={[draft.centerLat, draft.centerLng]}
                radius={circleOuterM}
                pathOptions={{
                  color: "#22c55e",
                  weight: 2,
                  fillOpacity: 0,
                }}
              />
              <Marker
                pane={PANE_PIVOT_EDIT}
                position={[draft.centerLat, draft.centerLng]}
                icon={centerDivIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = e.target.getLatLng();
                    if (!isValidLeafletLatLng(ll.lat, ll.lng)) return;
                    onDraftChange({ centerLat: ll.lat, centerLng: ll.lng });
                  },
                }}
              />
              {innerHandlePos ? (
                <Marker
                  pane={PANE_PIVOT_EDIT}
                  position={innerHandlePos}
                  icon={innerHandleIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = e.target.getLatLng();
                      if (!isValidLeafletLatLng(ll.lat, ll.lng)) return;
                      onInnerHandleDragEnd(ll.lat, ll.lng);
                    },
                  }}
                />
              ) : null}
              {outerHandlePos ? (
                <Marker
                  pane={PANE_PIVOT_EDIT}
                  position={outerHandlePos}
                  icon={outerHandleIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = e.target.getLatLng();
                      if (!isValidLeafletLatLng(ll.lat, ll.lng)) return;
                      onOuterHandleDragEnd(ll.lat, ll.lng);
                    },
                  }}
                />
              ) : null}
            </>
          ) : null}
        </MapContainer>
      </div>

      {activeBasemap && !activeBasemap.isSatellite ? (
        <p className="text-xs text-amber-800 dark:text-amber-200/90">
          Satellite tiles could not be loaded. Showing OpenStreetMap as a fallback.
        </p>
      ) : null}

      <div className="space-y-4 max-w-lg" key={radiusControlsEpoch}>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Inner radius (m)</Label>
            <span className="text-muted-foreground tabular-nums">{formatRadiusMeters(innerRadiusM)}</span>
          </div>
          <Slider
            min={0}
            max={PIVOT_RADIUS_MAX_M}
            step={1}
            value={[sliderRadiusForControl(innerRadiusM, PIVOT_RADIUS_MAX_M)]}
            onValueChange={onInnerSlider}
            disabled={!hasCenter}
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Outer radius (m)</Label>
            <span className="text-muted-foreground tabular-nums">{formatRadiusMeters(outerRadiusM)}</span>
          </div>
          <Slider
            min={0}
            max={PIVOT_RADIUS_MAX_M}
            step={1}
            value={[sliderRadiusForControl(outerRadiusM, PIVOT_RADIUS_MAX_M)]}
            onValueChange={onOuterSlider}
            disabled={!hasCenter}
          />
        </div>
        {!hasCenter ? (
          <p className="text-xs text-muted-foreground">
            Place a center on the map to enable radius sliders and handles. Minimum ring thickness is{" "}
            {PIVOT_RADIUS_MIN_GAP_M} m (outer must exceed inner).
          </p>
        ) : null}
      </div>
    </div>
  );
}
