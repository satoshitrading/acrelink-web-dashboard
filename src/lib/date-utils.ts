/**
 * Date utility functions for the application
 */

/**
 * Get date key in format YYYY-MM-DD (UTC calendar day from the instant).
 * For Open-Meteo daily keys or same-calendar-day UI, prefer {@link getLocalDateKey}.
 */
export const getDateKey = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

/**
 * Calendar YYYY-MM-DD in the environment's local timezone.
 * Use for ET₀ lookup keys so they match Open-Meteo `daily.time` with `timezone=auto`
 * (UTC {@link getDateKey} can shift evening local times to the wrong day, hiding the last forecast bar).
 */
export function getLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
