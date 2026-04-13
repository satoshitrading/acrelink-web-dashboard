import { getDateKey } from "@/lib/date-utils";
import { ZONE_AVERAGE_DATA_KEY } from "@/lib/zone-moisture-aggregate";
import { parseSeriesKey } from "@/lib/moisture-depth-series";
import {
  findZoneContainingNode,
  isNodeFilterValue,
  nodeIdFromZoneFilter,
} from "@/lib/zone-filter-utils";
import type { Zone, ZoneFilterValue, ZoneSummary, NodeReading } from "@/types/zone";
import {
  calibrateKVwcPerMmEt,
  findWarnThresholdCrossing,
  projectVwcWithEt,
} from "@/lib/vwc-et-projection";

function averageZoneDepthLive(
  zone: Zone,
  depthKey: string,
  readings: Record<string, NodeReading>
): number | null {
  const vals: number[] = [];
  for (const nid of zone.nodeIds) {
    const r = readings[nid];
    if (!r?.online) continue;
    const v = r.moistureByDepth?.[depthKey];
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function resolveForecastMoistureThresholds(
  zoneFilter: ZoneFilterValue,
  zones: Zone[],
  sensorWarnByNode: Record<string, number | null | undefined>,
  sensorCritByNode: Record<string, number | null | undefined>
): { warn: number | null; crit: number | null } {
  if (zoneFilter === "all" || zoneFilter === "unassigned") {
    return { warn: null, crit: null };
  }
  if (isNodeFilterValue(zoneFilter)) {
    const nid = nodeIdFromZoneFilter(zoneFilter);
    if (!nid) return { warn: null, crit: null };
    const z = findZoneContainingNode(zones, nid);
    const w = sensorWarnByNode[nid] ?? z?.moistureThresholdVwc ?? null;
    const c = sensorCritByNode[nid] ?? z?.moistureCriticalVwc ?? null;
    const warn = w != null && Number.isFinite(Number(w)) ? Number(w) : null;
    const crit = c != null && Number.isFinite(Number(c)) ? Number(c) : null;
    return { warn, crit };
  }
  const z = zones.find((zo) => zo.id === zoneFilter);
  if (!z) return { warn: null, crit: null };
  const w = z.moistureThresholdVwc;
  const c = z.moistureCriticalVwc;
  return {
    warn: w != null && Number.isFinite(Number(w)) ? Number(w) : null,
    crit: c != null && Number.isFinite(Number(c)) ? Number(c) : null,
  };
}

export function liveAnchorVwcForForecastSeries(
  key: string,
  zoneFilter: ZoneFilterValue,
  zones: Zone[],
  zoneSummaries: ZoneSummary[],
  allNodeReadings: Record<string, NodeReading>
): number | null {
  const parsed = parseSeriesKey(key);
  if (parsed) {
    if (parsed.entityId === ZONE_AVERAGE_DATA_KEY) {
      const z = zones.find((zo) => zo.id === zoneFilter);
      if (!z) return null;
      return averageZoneDepthLive(z, parsed.depthKey, allNodeReadings);
    }
    const r = allNodeReadings[parsed.entityId];
    if (!r?.online) return null;
    const v = r.moistureByDepth?.[parsed.depthKey];
    return v != null && Number.isFinite(v)
      ? Math.round(Number(v) * 10) / 10
      : null;
  }
  if (key === ZONE_AVERAGE_DATA_KEY) {
    const zs = zoneSummaries.find((z) => z.id === zoneFilter);
    const m = zs?.avgMoisture;
    return m != null && Number.isFinite(m) ? m : null;
  }
  if (zoneFilter === "all") {
    const zs = zoneSummaries.find((z) => z.id === key);
    const m = zs?.avgMoisture;
    return m != null && Number.isFinite(m) ? m : null;
  }
  const r = allNodeReadings[key];
  if (!r?.online) return null;
  const m = r.moisture;
  return m != null && Number.isFinite(m) ? Math.round(m * 10) / 10 : null;
}

export type DryingForecastChartResult = {
  rows: Record<string, unknown>[];
  forecastWarnVwc: number | null;
  forecastCritVwc: number | null;
  projectedIrrigationLabel: string;
};

export function buildDryingForecastChart(args: {
  now: Date;
  zoneFilter: ZoneFilterValue;
  zones: Zone[];
  zoneSummaries: ZoneSummary[];
  allNodeReadings: Record<string, NodeReading>;
  seriesKeys: string[];
  historyByDate: Record<string, Record<string, number>>;
  etByIsoDate: Record<string, number>;
  sensorWarnByNode: Record<string, number | null | undefined>;
  sensorCritByNode: Record<string, number | null | undefined>;
}): DryingForecastChartResult {
  const {
    now,
    zoneFilter,
    zones,
    zoneSummaries,
    allNodeReadings,
    seriesKeys,
    historyByDate,
    etByIsoDate,
    sensorWarnByNode,
    sensorCritByNode,
  } = args;

  const th = resolveForecastMoistureThresholds(
    zoneFilter,
    zones,
    sensorWarnByNode,
    sensorCritByNode
  );

  const etLookup: Record<string, number | undefined> = { ...etByIsoDate };
  const sortedHistoryDates = Object.keys(historyByDate).sort();

  type Proj = {
    key: string;
    anchor: number | null;
    points: ReturnType<typeof projectVwcWithEt>;
    crossing: ReturnType<typeof findWarnThresholdCrossing>;
  };

  const projections: Proj[] = [];

  for (const key of seriesKeys) {
    const anchor = liveAnchorVwcForForecastSeries(
      key,
      zoneFilter,
      zones,
      zoneSummaries,
      allNodeReadings
    );
    if (anchor == null) {
      projections.push({
        key,
        anchor: null,
        points: [],
        crossing: { kind: "not_within_horizon" },
      });
      continue;
    }
    const vwcByDate: Record<string, number | null | undefined> = {};
    for (const dk of sortedHistoryDates) {
      const v = historyByDate[dk]?.[key];
      vwcByDate[dk] = v != null && Number.isFinite(v) ? v : null;
    }
    const k = calibrateKVwcPerMmEt(sortedHistoryDates, vwcByDate, etLookup);
    const points = projectVwcWithEt(anchor, k, now, etLookup, 7);
    const crossing = findWarnThresholdCrossing(points, th.warn);
    projections.push({ key, anchor, points, crossing });
  }

  const rows: Record<string, unknown>[] = [];
  const todayKey = getDateKey(now);

  const firstRow: Record<string, unknown> = {
    day: now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    et0: etLookup[todayKey] ?? null,
  };
  for (const p of projections) {
    firstRow[p.key] =
      p.anchor != null && p.points[0] != null ? p.points[0].vwc : null;
  }
  rows.push(firstRow);

  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + i);
    const futureKey = getDateKey(futureDate);
    const dayData: Record<string, unknown> = {
      day: futureDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      et0: etLookup[futureKey] ?? null,
    };
    for (const p of projections) {
      dayData[p.key] = p.points[i] != null ? p.points[i]!.vwc : null;
    }
    rows.push(dayData);
  }

  let projectedIrrigationLabel: string;
  if (th.warn == null) {
    projectedIrrigationLabel =
      "Set a warning threshold on the zone or node to see a projected irrigation date.";
  } else {
    const anyBelow = projections.some((p) => p.crossing.kind === "already_below");
    const crosses = projections
      .filter((p) => p.crossing.kind === "cross")
      .map((p) => ({
        frac: (p.crossing as { kind: "cross"; fractionalDayFromStart: number })
          .fractionalDayFromStart,
      }));
    if (anyBelow) {
      projectedIrrigationLabel = `At or below your ${th.warn}% warning threshold now — irrigate or monitor closely.`;
    } else if (crosses.length > 0) {
      crosses.sort((a, b) => a.frac - b.frac);
      const minF = crosses[0]!.frac;
      const target = new Date(now.getTime() + minF * 24 * 60 * 60 * 1000);
      projectedIrrigationLabel = `Projected irrigation (warning ${th.warn}% VWC): ${target.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}.`;
    } else {
      const anyAnchor = projections.some((p) => p.anchor != null);
      if (!anyAnchor) {
        projectedIrrigationLabel =
          "No live moisture reading for this selection; projected curve unavailable.";
      } else {
        projectedIrrigationLabel =
          "Not projected to cross your warning threshold in the next 7 days.";
      }
    }
  }

  return {
    rows,
    forecastWarnVwc: th.warn,
    forecastCritVwc: th.crit,
    projectedIrrigationLabel,
  };
}
