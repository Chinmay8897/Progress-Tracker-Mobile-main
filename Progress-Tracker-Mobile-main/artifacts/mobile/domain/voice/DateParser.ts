/**
 * DateParser — Natural language date parsing.
 *
 * Converts phrases like "tomorrow", "Friday", "May 10", "next Monday"
 * into YYYY-MM-DD date keys. Timezone-safe (all operations use local dates).
 */

import { DateKey, normalizeDateKey, toDateKey } from "@/utils/date";

export interface DateParseResult {
  /** Normalized YYYY-MM-DD date key. */
  dateKey: DateKey;
  /** The substring matched as the date (for removal from raw text). */
  sourceText: string;
}

// ─── Lookup Tables ──────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isValid(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

function nextOrSameWeekday(now: Date, dow: number): Date {
  const d = startOfDay(now);
  const delta = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function nextWeekday(now: Date, dow: number): Date {
  const d = startOfDay(now);
  let delta = (dow - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

// ─── Individual Parsers ─────────────────────────────────────────────────────

function parseRelative(phrase: string, now: Date): DateKey | null {
  const lower = phrase.toLowerCase();
  if (/\btomorrow\b/.test(lower)) {
    const d = startOfDay(now);
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }
  if (/\btoday\b/.test(lower)) {
    return toDateKey(startOfDay(now));
  }
  const inDays = lower.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDays) {
    const days = Number(inDays[1]);
    if (!Number.isFinite(days) || days < 0) return null;
    const d = startOfDay(now);
    d.setDate(d.getDate() + days);
    return toDateKey(d);
  }
  return null;
}

function parseWeekday(phrase: string, now: Date): DateKey | null {
  const m = phrase.match(
    /\b(next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|ursday)?|fri(?:day)?|sat(?:urday)?)\b/i,
  );
  if (!m) return null;
  const isNext = Boolean(m[1]);
  const dow = WEEKDAYS[m[2].toLowerCase()];
  if (dow === undefined) return null;
  return toDateKey(isNext ? nextWeekday(now, dow) : nextOrSameWeekday(now, dow));
}

function parseMonthDay(phrase: string, now: Date): DateKey | null {
  const m = phrase.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{2,4}))?\b/i,
  );
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  const rawYear = m[3];
  if (!month || !Number.isFinite(day)) return null;

  const year = rawYear
    ? (rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear))
    : now.getFullYear();

  const candidate = new Date(year, month - 1, day);
  if (!isValid(candidate)) return null;

  // If no explicit year and date is past, assume next year.
  if (!rawYear && startOfDay(candidate) < startOfDay(now)) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }

  return toDateKey(candidate);
}

function parseNumericMDY(phrase: string, now: Date): DateKey | null {
  const m = phrase.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (!m) return null;

  const month = Number(m[1]);
  const day = Number(m[2]);
  const rawYear = m[3];
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;

  const year = rawYear
    ? (rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear))
    : now.getFullYear();

  const candidate = new Date(year, month - 1, day);
  if (!isValid(candidate)) return null;

  if (!rawYear && startOfDay(candidate) < startOfDay(now)) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }

  return toDateKey(candidate);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a standalone date phrase (e.g. "tomorrow", "May 10", "Friday").
 */
export function parseDatePhrase(phrase: string, now: Date = new Date()): DateKey | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  const iso = normalizeDateKey(trimmed);
  if (iso) return iso;

  return (
    parseRelative(trimmed, now) ??
    parseWeekday(trimmed, now) ??
    parseMonthDay(trimmed, now) ??
    parseNumericMDY(trimmed, now)
  );
}

/**
 * Find a deadline embedded in free-form text.
 *
 * Prioritises prefixed phrases ("by Friday", "due May 10") then falls
 * back to matching recognisable date patterns anywhere in the text.
 */
export function findDeadlineInText(text: string, now: Date = new Date()): DateParseResult | null {
  const raw = text.trim();
  if (!raw) return null;

  // 1. Explicit deadline prefix: "by …", "due …", "on …", "before …"
  const prefixed = raw.match(
    /\b(?:by|due|on|before)\s+([^,.!?]+?)(?=\s+(?:with|and|priority|send|notify|share|via)\b|$)/i,
  );
  if (prefixed) {
    const dateKey = parseDatePhrase(prefixed[1].trim(), now);
    if (dateKey) return { dateKey, sourceText: prefixed[0] };
  }

  // 2. ISO date anywhere
  const iso = raw.match(/\b\d{4}-\d{1,2}-\d{1,2}\b/);
  if (iso) {
    const dateKey = normalizeDateKey(iso[0]);
    if (dateKey) return { dateKey, sourceText: iso[0] };
  }

  // 3. Month + day anywhere
  const monthDay = raw.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?\b/i,
  );
  if (monthDay) {
    const dateKey = parseDatePhrase(monthDay[0], now);
    if (dateKey) return { dateKey, sourceText: monthDay[0] };
  }

  // 4. Relative keywords
  const rel = raw.match(/\b(?:today|tomorrow|in\s+\d{1,2}\s+days?)\b/i);
  if (rel) {
    const dateKey = parseDatePhrase(rel[0], now);
    if (dateKey) return { dateKey, sourceText: rel[0] };
  }

  // 5. Weekday names
  const weekday = raw.match(
    /\b(?:next\s+)?(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|ursday)?|fri(?:day)?|sat(?:urday)?)\b/i,
  );
  if (weekday) {
    const dateKey = parseDatePhrase(weekday[0], now);
    if (dateKey) return { dateKey, sourceText: weekday[0] };
  }

  // 6. Numeric M/D(/Y)
  const numeric = raw.match(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/);
  if (numeric) {
    const dateKey = parseDatePhrase(numeric[0], now);
    if (dateKey) return { dateKey, sourceText: numeric[0] };
  }

  return null;
}
