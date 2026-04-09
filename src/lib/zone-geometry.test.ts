import { describe, expect, it } from "vitest";
import {
  haversineDistanceMeters,
  hasValidPivotGeometry,
  buildAnnulusPolygonPositions,
  zoneToGeoJSONPolygonFeature,
  pointInPolygonRing,
} from "./zone-geometry";
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
});
