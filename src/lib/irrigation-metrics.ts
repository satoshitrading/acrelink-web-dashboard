import type { IrrigationEventRow } from "@/types/irrigation";
import type { Zone } from "@/types/zone";

function parseTreeToEventsByZone(
  val: unknown
): Record<string, IrrigationEventRow[]> {
  if (!val || typeof val !== "object") return {};
  const out: Record<string, IrrigationEventRow[]> = {};
  for (const [zoneId, zVal] of Object.entries(
    val as Record<string, unknown>
  )) {
    const events = (zVal as { events?: Record<string, unknown> })?.events;
    if (!events || typeof events !== "object") continue;
    const list: IrrigationEventRow[] = [];
    for (const ev of Object.values(events)) {
      if (
        ev &&
        typeof ev === "object" &&
        "timestamp" in ev &&
        "preVwc" in ev &&
        "postVwc" in ev
      ) {
        list.push(ev as IrrigationEventRow);
      }
    }
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    out[zoneId] = list;
  }
  return out;
}

export function parseIrrigationEventsSnapshot(val: unknown): Record<
  string,
  IrrigationEventRow[]
> {
  return parseTreeToEventsByZone(val);
}

/** Calendar year (Jan 1 local midnight) through now */
export function countSeasonIrrigationEvents(
  eventsByZoneId: Record<string, IrrigationEventRow[]>,
  now: Date = new Date()
): number {
  const y = now.getFullYear();
  const seasonStart = new Date(y, 0, 1).getTime();
  const end = now.getTime();
  let count = 0;
  for (const list of Object.values(eventsByZoneId)) {
    for (const ev of list) {
      const t = new Date(ev.timestamp).getTime();
      if (!Number.isNaN(t) && t >= seasonStart && t <= end) count++;
    }
  }
  return count;
}

export type IrrigationRangeMetrics = {
  count: number;
  lastTimestamp: string | null;
  avgPreVwc: number | null;
  avgPostVwc: number | null;
  avgDeltaVwc: number | null;
};

function toRounded1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function filterIrrigationEventsByDateRange(
  events: IrrigationEventRow[] | undefined,
  startMsInclusive: number,
  endMsInclusive: number
): IrrigationEventRow[] {
  if (!events?.length) return [];
  return events.filter((ev) => {
    const t = new Date(ev.timestamp).getTime();
    return !Number.isNaN(t) && t >= startMsInclusive && t <= endMsInclusive;
  });
}

export function buildIrrigationRangeMetrics(
  events: IrrigationEventRow[] | undefined,
  startMsInclusive: number,
  endMsInclusive: number
): IrrigationRangeMetrics {
  const inRange = filterIrrigationEventsByDateRange(
    events,
    startMsInclusive,
    endMsInclusive
  );
  if (inRange.length === 0) {
    return {
      count: 0,
      lastTimestamp: null,
      avgPreVwc: null,
      avgPostVwc: null,
      avgDeltaVwc: null,
    };
  }

  let lastTimestamp: string | null = null;
  let lastMs = -Infinity;
  let preSum = 0;
  let postSum = 0;
  let deltaSum = 0;
  let validRows = 0;

  for (const ev of inRange) {
    const ts = new Date(ev.timestamp).getTime();
    if (!Number.isNaN(ts) && ts > lastMs) {
      lastMs = ts;
      lastTimestamp = ev.timestamp;
    }

    const pre = Number(ev.preVwc);
    const post = Number(ev.postVwc);
    if (!Number.isFinite(pre) || !Number.isFinite(post)) continue;
    preSum += pre;
    postSum += post;
    deltaSum += post - pre;
    validRows += 1;
  }

  return {
    count: inRange.length,
    lastTimestamp,
    avgPreVwc: validRows ? toRounded1(preSum / validRows) : null,
    avgPostVwc: validRows ? toRounded1(postSum / validRows) : null,
    avgDeltaVwc: validRows ? toRounded1(deltaSum / validRows) : null,
  };
}

function daysSinceEvent(tsIso: string, now: Date): number {
  const t = new Date(tsIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((now.getTime() - t) / 86400000);
}

function lastEventForZone(
  list: IrrigationEventRow[] | undefined
): IrrigationEventRow | null {
  if (!list?.length) return null;
  let best: IrrigationEventRow | null = null;
  let bestMs = -Infinity;
  for (const ev of list) {
    const ms = new Date(ev.timestamp).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = ev;
    }
  }
  return best;
}

export type ZoneIrrigationSummary = {
  maxDaysSinceLastDetected: number | null;
  perZone: { zoneId: string; name: string; daysSince: number | null }[];
};

/** Among zones with nodes: max “days since” last detected irrigation (zones with no events excluded from max). */
export function buildZoneIrrigationSummary(
  zones: Zone[],
  eventsByZoneId: Record<string, IrrigationEventRow[]>,
  now: Date = new Date()
): ZoneIrrigationSummary {
  const perZone: ZoneIrrigationSummary["perZone"] = [];
  let maxDays: number | null = null;

  for (const z of zones) {
    if (z.nodeIds.length === 0) continue;
    const last = lastEventForZone(eventsByZoneId[z.id]);
    if (!last) {
      perZone.push({ zoneId: z.id, name: z.name, daysSince: null });
      continue;
    }
    const d = daysSinceEvent(last.timestamp, now);
    perZone.push({ zoneId: z.id, name: z.name, daysSince: d });
    if (maxDays === null || d > maxDays) maxDays = d;
  }

  return { maxDaysSinceLastDetected: maxDays, perZone };
}
