/** Matches default in RTDB / zoneService for new zones. */
export const DEFAULT_ZONE_COLOR = "#6366f1";

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;

/**
 * Returns a safe #rrggbb string for CSS and storage, or {@link DEFAULT_ZONE_COLOR}.
 */
export function normalizeZoneColor(raw: string | undefined | null): string {
  if (raw == null || typeof raw !== "string") return DEFAULT_ZONE_COLOR;
  const s = raw.trim();
  if (!s) return DEFAULT_ZONE_COLOR;
  if (HEX6.test(s)) return s.toLowerCase();
  const m3 = s.match(HEX3);
  if (m3) {
    const x = m3[1];
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
  }
  return DEFAULT_ZONE_COLOR;
}
