/**
 * Converts a Date to a local date string in YYYY-MM-DD format using local timezone
 * (not UTC, which can be one day off for UTC+ timezones)
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts a period string to a date range with ISO date strings
 * @param period - The period value: "today", "7d", "30d", "month", or "custom"
 * @returns Object with from and to ISO date strings (YYYY-MM-DD), or null if period is "custom"
 */
export function getPeriodDateRange(period: string): { from: string; to: string } | null {
  if (period === 'custom') {
    return null; // Custom range should use its own from/to state
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const toDate = new Date(today);
  toDate.setHours(23, 59, 59, 999);
  const toIso = toLocalDateString(toDate);

  if (period === 'today') {
    const fromIso = toLocalDateString(today);
    return { from: fromIso, to: toIso };
  }

  if (period === '7d') {
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 6);
    const fromIso = toLocalDateString(fromDate);
    return { from: fromIso, to: toIso };
  }

  if (period === '30d') {
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 29);
    const fromIso = toLocalDateString(fromDate);
    return { from: fromIso, to: toIso };
  }

  if (period === 'month') {
    const firstDay = new Date(today);
    firstDay.setDate(1);
    const fromIso = toLocalDateString(firstDay);
    return { from: fromIso, to: toIso };
  }

  // Default to 7d
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 6);
  const fromIso = toLocalDateString(fromDate);
  return { from: fromIso, to: toIso };
}
