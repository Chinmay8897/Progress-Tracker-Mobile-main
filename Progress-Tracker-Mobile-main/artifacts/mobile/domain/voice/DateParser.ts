import { DateKey, normalizeDateKey, toDateKey } from "@/utils/date";

export interface DateParseInTextResult {
  /** Normalized ISO date key (local date): YYYY-MM-DD */
  dateKey: DateKey;
  /** The substring that was interpreted as the deadline (useful for debugging/removal). */
  sourceText: string;
}

function startOfDayLocal(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isValidDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function nextOrSameWeekday(now: Date, targetDow: number): Date {
  const d = startOfDayLocal(now);
  const current = d.getDay();
  const delta = (targetDow - current + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function nextWeekday(now: Date, targetDow: number): Date {
  const d = startOfDayLocal(now);
  const current = d.getDay();
  let delta = (targetDow - current + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function parseMonthDayPhrase(phrase: string, now: Date): DateKey | null {
  const m = phrase.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{2,4}))?\b/i,
  );
  if (!m) return null;

  const monthToken = m[1].toLowerCase();
  const month = MONTHS[monthToken];
  const day = Number(m[2]);
  const rawYear = m[3];

  if (!month || !Number.isFinite(day)) return null;

  const year = rawYear
    ? (rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear))
    : now.getFullYear();

  const candidate = new Date(year, month - 1, day);
  if (!isValidDate(candidate)) return null;

  // If year not explicitly provided and the date has already passed, assume next year.
  if (!rawYear) {
    const todayStart = startOfDayLocal(now);
    const candidateStart = startOfDayLocal(candidate);
    if (candidateStart < todayStart) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
  }

  return toDateKey(candidate);
}

function parseNumericMdYPhrase(phrase: string, now: Date): DateKey | null {
  // Supports: 5/10, 05/10/2026, 5-10-26
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
  if (!isValidDate(candidate)) return null;

  if (!rawYear) {
    const todayStart = startOfDayLocal(now);
    const candidateStart = startOfDayLocal(candidate);
    if (candidateStart < todayStart) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
  }

  return toDateKey(candidate);
}

function parseWeekdayPhrase(phrase: string, now: Date): DateKey | null {
  const m = phrase.match(/\b(next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|ursday)?|fri(?:day)?|sat(?:urday)?)\b/i);
  if (!m) return null;

  const isNext = Boolean(m[1]);
  const dayToken = m[2].toLowerCase();
  const dow = WEEKDAYS[dayToken];
  if (dow === undefined) return null;

  const targetDate = isNext ? nextWeekday(now, dow) : nextOrSameWeekday(now, dow);
  return toDateKey(targetDate);
}

function parseRelativePhrase(phrase: string, now: Date): DateKey | null {
  const lower = phrase.toLowerCase();

  if (/\btomorrow\b/.test(lower)) {
    const d = startOfDayLocal(now);
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }

  if (/\btoday\b/.test(lower)) {
    return toDateKey(startOfDayLocal(now));
  }

  const inDays = lower.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDays) {
    const days = Number(inDays[1]);
    if (!Number.isFinite(days) || days < 0) return null;
    const d = startOfDayLocal(now);
    d.setDate(d.getDate() + days);
    return toDateKey(d);
  }

  return null;
}

/**
 * Parses a natural-language date phrase into a local `YYYY-MM-DD` date key.
 *
 * Supported examples:
 * - "tomorrow"
 * - "Friday" / "next Friday"
 * - "May 10" / "May 10, 2026"
 * - "2026-05-10"
 * - "5/10" / "05/10/2026"
 */
export function parseNaturalLanguageDatePhrase(phrase: string, now: Date = new Date()): DateKey | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  // ISO date anywhere
  const normalized = normalizeDateKey(trimmed);
  if (normalized) return normalized;

  // Relative keywords
  const rel = parseRelativePhrase(trimmed, now);
  if (rel) return rel;

  // Weekday names
  const dow = parseWeekdayPhrase(trimmed, now);
  if (dow) return dow;

  // Month name + day
  const monthDay = parseMonthDayPhrase(trimmed, now);
  if (monthDay) return monthDay;

  // Numeric M/D(/Y)
  const numeric = parseNumericMdYPhrase(trimmed, now);
  if (numeric) return numeric;

  return null;
}

/**
 * Finds a deadline/date inside free-form text.
 *
 * Prioritizes phrases like "by May 10" / "due tomorrow" / "on Friday",
 * but will fall back to matching recognizable dates anywhere in the text.
 */
export function findDeadlineInText(text: string, now: Date = new Date()): DateParseInTextResult | null {
  const raw = text.trim();
  if (!raw) return null;

  // Prefer explicit deadline prefixes.
  const prefixed = raw.match(
    /\b(?:by|due|on|before)\s+([^,.!?]+?)(?=\s+(?:with|and|priority|send|notify|share|via)\b|$)/i,
  );
  if (prefixed) {
    const phrase = prefixed[1].trim();
    const dateKey = parseNaturalLanguageDatePhrase(phrase, now);
    if (dateKey) {
      return { dateKey, sourceText: prefixed[0] };
    }
  }

  // ISO date anywhere.
  const iso = raw.match(/\b\d{4}-\d{1,2}-\d{1,2}\b/);
  if (iso) {
    const dateKey = normalizeDateKey(iso[0]);
    if (dateKey) return { dateKey, sourceText: iso[0] };
  }

  // Month day anywhere.
  const monthDay = raw.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?\b/i,
  );
  if (monthDay) {
    const dateKey = parseNaturalLanguageDatePhrase(monthDay[0], now);
    if (dateKey) return { dateKey, sourceText: monthDay[0] };
  }

  // Relative keywords anywhere.
  const rel = raw.match(/\b(?:today|tomorrow|in\s+\d{1,2}\s+days?)\b/i);
  if (rel) {
    const dateKey = parseNaturalLanguageDatePhrase(rel[0], now);
    if (dateKey) return { dateKey, sourceText: rel[0] };
  }

  // Weekday anywhere.
  const weekday = raw.match(
    /\b(?:next\s+)?(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|ursday)?|fri(?:day)?|sat(?:urday)?)\b/i,
  );
  if (weekday) {
    const dateKey = parseNaturalLanguageDatePhrase(weekday[0], now);
    if (dateKey) return { dateKey, sourceText: weekday[0] };
  }

  // Numeric M/D(/Y) anywhere.
  const numeric = raw.match(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/);
  if (numeric) {
    const dateKey = parseNaturalLanguageDatePhrase(numeric[0], now);
    if (dateKey) return { dateKey, sourceText: numeric[0] };
  }

  return null;
}
