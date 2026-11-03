/**
 * Each member's own time zone (IANA name, e.g. "America/New_York"), saved from their browser at signup
 * and editable on Me (build plan 1.3). Everything "per day" for a member (streaks, the weekly volume
 * chart, the chat's daily allowance, reminder wording) uses it. A member with none saved yet is on UTC
 * until their browser sends one.
 */
export const FALLBACK_TIMEZONE = "UTC";

/** True for a time zone this server's clock knows. */
export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zoneOf(tz: string | null | undefined): string {
  return isTimezone(tz) ? tz : FALLBACK_TIMEZONE;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
function parts(d: Date, tz: string): { y: number; m: number; day: number; h: number; min: number; s: number } {
  let f = dayFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    dayFormats.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p["year"]), m: Number(p["month"]), day: Number(p["day"]), h: Number(p["hour"]), min: Number(p["minute"]), s: Number(p["second"]) };
}

/** Calendar day number (days since 1970-01-01) of an instant, in the member's zone. */
export function localDay(d: Date, tz: string | null | undefined): number {
  const p = parts(d, zoneOf(tz));
  return Math.floor(Date.UTC(p.y, p.m - 1, p.day) / 86_400_000);
}

/** The instant the member's current day began (their local midnight), daylight saving included. */
export function localDayStart(now: Date, tz: string | null | undefined): Date {
  const zone = zoneOf(tz);
  const p = parts(now, zone);
  const midnightAsUtc = Date.UTC(p.y, p.m - 1, p.day);
  // The zone's offset at a given instant: its wall clock read as UTC, minus the instant.
  const offset = (at: number) => { const q = parts(new Date(at), zone); return Date.UTC(q.y, q.m - 1, q.day, q.h, q.min, q.s) - at; };
  let guess = midnightAsUtc - offset(midnightAsUtc);
  guess = midnightAsUtc - offset(guess); // second pass settles a daylight-saving change on the day
  return new Date(guess);
}

/** Monday of the member's week, as YYYY-MM-DD. */
export function localWeekStart(d: Date, tz: string | null | undefined): string {
  const day = localDay(d, tz);
  const weekday = (day + 3) % 7; // day 0 (1970-01-01) was a Thursday → Monday = 0
  return new Date((day - weekday) * 86_400_000).toISOString().slice(0, 10);
}
