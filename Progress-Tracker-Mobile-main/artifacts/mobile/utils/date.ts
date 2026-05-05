export type DateKey = `${number}-${string}-${string}`;

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (year < 1970 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Normalizes anything containing a date into a `YYYY-MM-DD` key (local calendar date).
 *
 * Examples accepted:
 * - `2026-05-03`
 * - `2026-5-3`
 * - `2026-05-03T12:34:56.000Z`
 */
export function normalizeDateKey(value: string): DateKey | null {
  const match = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidYmd(year, month, day)) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns a local Date at midnight for a `YYYY-MM-DD` key. */
export function parseDateKey(dateKey: string): Date | null {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return null;

  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Converts a Date to a local `YYYY-MM-DD` key (no timezone shifts). */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayDateKey(): DateKey {
  return toDateKey(new Date());
}

export function addDaysToDateKey(dateKey: string, days: number): DateKey | null {
  const base = parseDateKey(dateKey);
  if (!base) return null;

  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
