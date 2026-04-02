/**
 * Date utility functions for the application
 */

/**
 * Get date key in format YYYY-MM-DD
 * @param date - Date object to convert
 * @returns Date string in YYYY-MM-DD format
 */
export const getDateKey = (date: Date): string => {
    return date.toISOString().split('T')[0];
};
