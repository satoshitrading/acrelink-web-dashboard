import type { Zone } from "@/types/zone";
import { convexHull, type Point2 } from "@/lib/convex-hull";

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_ANNULUS_SEGMENTS = 64;

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Destination point given start lat/lng, initial bearing (degrees clockwise from north), distance (m). */
export function destinationPointMeters(
  latDeg: number,
  lngDeg: number,
  bearingDeg: number,
  distanceM: number
): [number, number] {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (latDeg * Math.PI) / 180;
  const λ1 = (lngDeg * Math.PI) / 180;

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinθ = Math.sin(θ);
  const cosθ = Math.cos(θ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
  const φ2 = Math.asin(sinφ2);
  const y = sinθ * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
}

/**
 * Leaflet polygon-with-hole: [outerRing, innerRing].
 * Outer is CCW, inner is CW (hole) when viewed from above — standard for SVG/Leaflet holes.
 */
export function buildAnnulusPolygonPositions(
  centerLat: number,
  centerLng: number,
  innerRadiusM: number,
  outerRadiusM: number,
  segments = DEFAULT_ANNULUS_SEGMENTS
): [[number, number][], [number, number][]] {
  const n = Math.max(12, segments);
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const bearing = (i / n) * 360;
    outer.push(destinationPointMeters(centerLat, centerLng, bearing, outerRadiusM));
  }
  if (outer.length >= 3) outer.push([...outer[0]]);
  for (let i = n - 1; i >= 0; i--) {
    const bearing = (i / n) * 360;
    inner.push(destinationPointMeters(centerLat, centerLng, bearing, innerRadiusM));
  }
  if (inner.length >= 3) inner.push([...inner[0]]);
  return [outer, inner];
}

export function hasValidPivotGeometry(zone: Zone): boolean {
  if (!zone.isCenterPivot) return false;
  const { centerLat, centerLng, innerRadiusM, outerRadiusM } = zone;
  if (
    centerLat === undefined ||
    centerLng === undefined ||
    innerRadiusM === undefined ||
    outerRadiusM === undefined
  ) {
    return false;
  }
  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(innerRadiusM) ||
    !Number.isFinite(outerRadiusM)
  ) {
    return false;
  }
  if (centerLat < -90 || centerLat > 90) return false;
  if (centerLng < -180 || centerLng > 180) return false;
  if (innerRadiusM < 0) return false;
  return outerRadiusM > innerRadiusM;
}

function hullRingFromZone(
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

/** Leaflet `Polygon` positions: one ring, or [outer, inner] for annulus. */
export type ZoneMapPositions =
  | [number, number][]
  | [[number, number][], [number, number][]];

export function zoneMapPositionsRenderable(
  positions: ZoneMapPositions | null
): boolean {
  if (!positions) return false;
  const first = positions[0];
  if (typeof first[0] === "number") {
    return (positions as [number, number][]).length >= 3;
  }
  const [outer, inner] = positions as [
    [number, number][],
    [number, number][]
  ];
  return outer.length >= 3 && inner.length >= 3;
}

/**
 * Positions for Leaflet `Polygon`: simple ring, or polygon-with-hole for pivot annulus.
 */
export function getZoneMapPositions(
  zone: Zone,
  gpsByNodeId: Record<string, { lat: number; lng: number }>
): ZoneMapPositions | null {
  if (hasValidPivotGeometry(zone)) {
    const { centerLat, centerLng, innerRadiusM, outerRadiusM } = zone;
    return buildAnnulusPolygonPositions(
      centerLat!,
      centerLng!,
      innerRadiusM!,
      outerRadiusM!
    );
  }
  const ring = hullRingFromZone(zone, gpsByNodeId);
  if (!ring || ring.length < 3) return null;
  return ring;
}

/** Ray-cast point-in-polygon; ring closed (first point may repeat last). */
export function pointInPolygonRing(
  lat: number,
  lng: number,
  ring: [number, number][]
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isNodeInZoneGeometry(
  zone: Zone,
  nodeId: string,
  gpsByNodeId: Record<string, { lat: number; lng: number }>
): boolean {
  if (hasValidPivotGeometry(zone)) {
    const g = gpsByNodeId[nodeId];
    if (!g) return zone.nodeIds.includes(nodeId);
    const d = haversineDistanceMeters(
      zone.centerLat!,
      zone.centerLng!,
      g.lat,
      g.lng
    );
    return d >= zone.innerRadiusM! && d <= zone.outerRadiusM!;
  }
  const ring = hullRingFromZone(zone, gpsByNodeId);
  if (!ring || ring.length < 3) {
    return zone.nodeIds.includes(nodeId);
  }
  const g = gpsByNodeId[nodeId];
  if (!g) return zone.nodeIds.includes(nodeId);
  return pointInPolygonRing(g.lat, g.lng, ring);
}

/** Flatten outer ring vertices for fitBounds (pivot annulus or hull). */
export function flattenZoneMapPositionsToLatLngs(
  positions: NonNullable<ReturnType<typeof getZoneMapPositions>>
): [number, number][] {
  if (Array.isArray(positions[0]) && typeof positions[0][0] === "number") {
    return positions as [number, number][];
  }
  const [outer] = positions as [[number, number][], [number, number][]];
  return outer.map(([lat, lng]) => [lat, lng]);
}

type GeoJSONPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJSONPolygon | null;
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

/**
 * GeoJSON uses lon,lat order in coordinates. Single ring or outer+inner for pivot annulus.
 */
export function zoneToGeoJSONPolygonFeature(
  zone: Zone,
  gpsByNodeId: Record<string, { lat: number; lng: number }>
): GeoJSONFeature {
  const positions = getZoneMapPositions(zone, gpsByNodeId);
  if (!positions) {
    return {
      type: "Feature",
      properties: { zoneId: zone.id, name: zone.name },
      geometry: null,
    };
  }

  const ringToGeoJSON = (ring: [number, number][]) =>
    ring.map(([lat, lng]) => [lng, lat]);

  if (Array.isArray(positions[0]) && typeof positions[0][0] === "number") {
    const ring = positions as [number, number][];
    const closed =
      ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] ||
        ring[0][1] !== ring[ring.length - 1][1])
        ? [...ring, ring[0]]
        : ring;
    return {
      type: "Feature",
      properties: { zoneId: zone.id, name: zone.name },
      geometry: {
        type: "Polygon",
        coordinates: [ringToGeoJSON(closed)],
      },
    };
  }

  const [outer, inner] = positions as [
    [number, number][],
    [number, number][]
  ];
  const close = (r: [number, number][]) =>
    r.length > 0 &&
    (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])
      ? [...r, r[0]]
      : r;

  return {
    type: "Feature",
    properties: { zoneId: zone.id, name: zone.name },
    geometry: {
      type: "Polygon",
      coordinates: [ringToGeoJSON(close(outer)), ringToGeoJSON(close(inner))],
    },
  };
}

/** All site zones as a GeoJSON FeatureCollection (hull or annulus per zone). */
export function siteZonesToGeoJSONFeatureCollection(
  zones: Zone[],
  gpsByNodeId: Record<string, { lat: number; lng: number }>
): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => zoneToGeoJSONPolygonFeature(z, gpsByNodeId)),
  };
}

/** Single zone wrapped as a FeatureCollection (handy for downloads). */
export function singleZoneToGeoJSONFeatureCollection(
  zone: Zone,
  gpsByNodeId: Record<string, { lat: number; lng: number }>
): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [zoneToGeoJSONPolygonFeature(zone, gpsByNodeId)],
  };
}

/** Trigger a browser download of GeoJSON (no-op outside a browser). */
export function downloadGeoJSONObject(
  filename: string,
  geojson: GeoJSONFeatureCollection | Record<string, unknown>
): void {
  if (typeof document === "undefined") return;
  const name = filename.endsWith(".geojson") ? filename : `${filename}.geojson`;
  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
