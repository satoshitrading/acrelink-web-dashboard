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
