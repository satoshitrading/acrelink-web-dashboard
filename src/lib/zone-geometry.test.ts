import { describe, expect, it } from "vitest";
import {
  haversineDistanceMeters,
  hasValidPivotGeometry,
  buildAnnulusPolygonPositions,
  zoneToGeoJSONPolygonFeature,
  singleZoneToGeoJSONFeatureCollection,
  siteZonesToGeoJSONFeatureCollection,
  pointInPolygonRing,
} from "./zone-geometry";
import type { SiteSensorGeoExportRow } from "@/hooks/useSiteSensorsGps";
import type { Zone } from "@/types/zone";

function baseZone(over: Partial<Zone>): Zone {
  return {
    id: "z1",
    name: "Test",
    color: "#6366f1",
    siteId: "s1",
    nodeIds: [],
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("haversineDistanceMeters", () => {
  it("returns near zero for identical points", () => {
    expect(haversineDistanceMeters(40, -100, 40, -100)).toBeLessThan(1);
  });

  it("returns about 111 km for one degree of latitude", () => {
    const d = haversineDistanceMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("hasValidPivotGeometry", () => {
  it("is false when pivot flag is off", () => {
    expect(hasValidPivotGeometry(baseZone({ isCenterPivot: false }))).toBe(false);
    expect(hasValidPivotGeometry(baseZone({}))).toBe(false);
  });

  it("allows inner radius zero when outer is larger", () => {
    expect(
      hasValidPivotGeometry(
        baseZone({
          isCenterPivot: true,
          centerLat: 41,
          centerLng: -98,
          innerRadiusM: 0,
          outerRadiusM: 100,
        })
      )
    ).toBe(true);
  });

  it("rejects outer less than or equal to inner", () => {
    expect(
      hasValidPivotGeometry(
        baseZone({
          isCenterPivot: true,
          centerLat: 41,
          centerLng: -98,
          innerRadiusM: 50,
          outerRadiusM: 50,
        })
      )
    ).toBe(false);
  });

  it("rejects negative inner radius", () => {
    expect(
      hasValidPivotGeometry(
        baseZone({
          isCenterPivot: true,
          centerLat: 41,
          centerLng: -98,
          innerRadiusM: -1,
          outerRadiusM: 100,
        })
      )
    ).toBe(false);
  });
});

describe("buildAnnulusPolygonPositions", () => {
  it("places outer vertices near outerRadius from center", () => {
    const [outer] = buildAnnulusPolygonPositions(40, -100, 10, 500, 32);
    const d = haversineDistanceMeters(40, -100, outer[0][0], outer[0][1]);
    expect(d).toBeGreaterThan(490);
    expect(d).toBeLessThan(510);
  });

  it("closes outer and inner rings", () => {
    const [outer, inner] = buildAnnulusPolygonPositions(40, -100, 50, 200, 16);
    expect(outer.length).toBeGreaterThanOrEqual(10);
    expect(inner.length).toBeGreaterThanOrEqual(10);
    expect(outer[0][0]).toBeCloseTo(outer[outer.length - 1][0], 5);
    expect(inner[0][0]).toBeCloseTo(inner[inner.length - 1][0], 5);
  });
});

describe("pointInPolygonRing", () => {
  it("detects interior of a simple square (lat/lng as y/x)", () => {
    const square: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    expect(pointInPolygonRing(0.5, 0.5, square)).toBe(true);
    expect(pointInPolygonRing(1.5, 0.5, square)).toBe(false);
  });
});

describe("zoneToGeoJSONPolygonFeature", () => {
  it("returns two coordinate rings for a valid pivot zone", () => {
    const zone = baseZone({
      isCenterPivot: true,
      centerLat: 40,
      centerLng: -100,
      innerRadiusM: 50,
      outerRadiusM: 200,
    });
    const f = zoneToGeoJSONPolygonFeature(zone, {});
    expect(f.geometry).not.toBeNull();
    expect(f.geometry!.type).toBe("Polygon");
    expect(f.geometry!.coordinates.length).toBe(2);
    expect(f.geometry!.coordinates[0][0][0]).toBeTypeOf("number");
  });

  it("includes nodeCount and lastUpdated in polygon properties", () => {
    const zone = baseZone({
      nodeIds: ["n1", "n2", "n3"],
      updatedAt: "2026-04-16T10:00:00.000Z",
      isCenterPivot: true,
      centerLat: 40,
      centerLng: -100,
      innerRadiusM: 50,
      outerRadiusM: 200,
    });
    const f = zoneToGeoJSONPolygonFeature(zone, {});
    expect(f.properties.nodeCount).toBe(3);
    expect(f.properties.lastUpdated).toBe("2026-04-16T10:00:00.000Z");
  });
});

describe("GeoJSON FeatureCollection exports", () => {
  const gpsByNodeId = {
    n1: { lat: 40.1, lng: -100.1 },
    n2: { lat: 40.2, lng: -100.2 },
  };

  const nodeExportByNodeId: Record<string, SiteSensorGeoExportRow> = {
    n1: {
      displayName: "North Sensor 1",
      depth: "Shallow (0–6 in)",
      lastUpdated: "2026-04-16T10:30:00.000Z",
    },
    n2: {
      displayName: "North Sensor 2",
      depth: null,
      lastUpdated: null,
    },
  };

  it("single-zone export returns polygon then node Point features", () => {
    const zone = baseZone({
      nodeIds: ["n1", "n2", "n3"],
      isCenterPivot: true,
      centerLat: 40,
      centerLng: -100,
      innerRadiusM: 10,
      outerRadiusM: 150,
    });

    const fc = singleZoneToGeoJSONFeatureCollection(
      zone,
      gpsByNodeId,
      nodeExportByNodeId
    );

    expect(fc.features.length).toBe(3);
    expect(fc.features[0].geometry?.type).toBe("Polygon");
    expect(fc.features[1].geometry?.type).toBe("Point");
    expect(fc.features[1].properties).toMatchObject({
      zoneId: "z1",
      nodeId: "n1",
      name: "North Sensor 1",
      depth: "Shallow (0–6 in)",
      lastUpdated: "2026-04-16T10:30:00.000Z",
    });
    expect(fc.features[2].properties).toMatchObject({
      nodeId: "n2",
      name: "North Sensor 2",
      depth: null,
      lastUpdated: null,
    });
  });

  it("site export keeps polygon + points ordering and skips nodes without GPS", () => {
    const pivotZone = baseZone({
      id: "pivot",
      name: "Pivot Zone",
      nodeIds: ["n1", "n3"],
      isCenterPivot: true,
      centerLat: 40,
      centerLng: -100,
      innerRadiusM: 10,
      outerRadiusM: 150,
    });
    const hullZone = baseZone({
      id: "hull",
      name: "Hull Zone",
      nodeIds: ["n2", "n4", "n5"],
      isCenterPivot: false,
    });

    const fc = siteZonesToGeoJSONFeatureCollection(
      [pivotZone, hullZone],
      gpsByNodeId,
      nodeExportByNodeId
    );

    // pivot polygon + n1 point, then hull polygon + n2 point
    expect(fc.features.length).toBe(4);
    expect(fc.features[0].properties.zoneId).toBe("pivot");
    expect(fc.features[0].geometry?.type).toBe("Polygon");
    expect(fc.features[1].properties.nodeId).toBe("n1");
    expect(fc.features[1].geometry?.type).toBe("Point");
    expect(fc.features[2].properties.zoneId).toBe("hull");
    expect(fc.features[2].geometry).toBeNull();
    expect(fc.features[3].properties.nodeId).toBe("n2");
  });
});
