import { getDateKey } from "@/lib/date-utils";

export const DEFAULT_K_VWC_PER_MM_ET = 0.12;
export const K_VWC_PER_MM_ET_MIN = 0.02;
export const K_VWC_PER_MM_ET_MAX = 2.5;
/** When Open-Meteo has no value for a date key, assume this ET₀ (mm/day) so projection still depletes. */
export const FALLBACK_ET_MM_PER_DAY = 4;

/** Calendar days between two YYYY-MM-DD strings (UTC noon anchors). */
export function calendarDaysBetweenIso(prevIso: string, currIso: string): number {
  const a = new Date(`${prevIso}T12:00:00.000Z`);
  const b = new Date(`${currIso}T12:00:00.000Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function calibrateKVwcPerMmEt(
  sortedDateKeysAsc: string[],
  vwcByDate: Record<string, number | null | undefined>,
  etByIsoDate: Record<string, number | undefined>
): number {
  const ks: number[] = [];
  for (let i = 1; i < sortedDateKeysAsc.length; i++) {
    const prevD = sortedDateKeysAsc[i - 1]!;
    const currD = sortedDateKeysAsc[i]!;
    if (calendarDaysBetweenIso(prevD, currD) !== 1) continue;
    const vPrev = vwcByDate[prevD];
    const vCurr = vwcByDate[currD];
    const et = etByIsoDate[currD];
    if (vPrev == null || vCurr == null || Number.isNaN(vPrev) || Number.isNaN(vCurr)) continue;
    if (et == null || et <= 0 || Number.isNaN(et)) continue;
    const drop = vPrev - vCurr;
    if (drop <= 0) continue;
    ks.push(drop / et);
  }
  if (ks.length === 0) return DEFAULT_K_VWC_PER_MM_ET;
  const k = median(ks);
  return Math.min(K_VWC_PER_MM_ET_MAX, Math.max(K_VWC_PER_MM_ET_MIN, k));
}

export type VwcProjectionPoint = { isoDate: string; vwc: number };

export function projectVwcWithEt(
  anchorVwc: number,
  k: number,
  startDate: Date,
  etByIsoDate: Record<string, number | undefined>,
  futureDayCount: number
): VwcProjectionPoint[] {
  const out: VwcProjectionPoint[] = [];
  let v = anchorVwc;
  const todayKey = getDateKey(startDate);
  out.push({ isoDate: todayKey, vwc: Math.round(Math.max(0, v) * 10) / 10 });
  for (let i = 1; i <= futureDayCount; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const iso = getDateKey(d);
    const rawEt = etByIsoDate[iso];
    const et =
      rawEt != null && Number.isFinite(rawEt)
        ? rawEt
        : FALLBACK_ET_MM_PER_DAY;
    v = Math.max(0, v - k * et);
    out.push({ isoDate: iso, vwc: Math.round(v * 10) / 10 });
  }
  return out;
}

export type WarnCrossingResult =
  | { kind: "no_warn_threshold" }
  | { kind: "already_below" }
  | { kind: "not_within_horizon" }
  | { kind: "cross"; fractionalDayFromStart: number };

export function findWarnThresholdCrossing(
  points: VwcProjectionPoint[],
  warn: number | null | undefined
): WarnCrossingResult {
  if (warn == null || Number.isNaN(warn)) return { kind: "no_warn_threshold" };
  if (points.length === 0) return { kind: "not_within_horizon" };
  if (points[0]!.vwc < warn) return { kind: "already_below" };
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (curr.vwc >= warn) continue;
    const drop = prev.vwc - curr.vwc;
    if (drop <= 0) return { kind: "cross", fractionalDayFromStart: i };
    const t = (prev.vwc - warn) / drop;
    const fractional = i - 1 + Math.max(0, Math.min(1, t));
    return { kind: "cross", fractionalDayFromStart: fractional };
  }
  return { kind: "not_within_horizon" };
}
