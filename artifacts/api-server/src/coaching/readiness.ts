/**
 * The morning check-in's readiness rule (docs/TIERS-AND-BODY-SPEC.md §7). Pure. A low day changes only the VIEW of
 * sessions with nothing logged yet (one fewer set, at least 1; loads 10% lighter, rounded down to 0.5 kg). The stored
 * plan never changes. With no check-in, nothing changes.
 */
export type Checkin = { sleepHalfHours: number; energy: number; soreness: number };

export const SLEEP_SHORT_HALF_HOURS = 12; // under 6 hours
export const SORE = 4;

/** Pure: the reason the day is low, or null. */
export function lowDayReason(c: Checkin | null | undefined): string | null {
  if (!c || c.soreness < SORE) return null;
  if (c.sleepHalfHours < SLEEP_SHORT_HALF_HOURS) return "Lighter today: short sleep and sore. Your plan is unchanged.";
  if (c.energy === 1) return "Lighter today: low energy and sore. Your plan is unchanged.";
  return null;
}

export const lighterSets = (sets: number) => Math.max(1, sets - 1);
export const lighterLoad = (kg: number | null) => (kg === null ? null : Math.floor(kg * 0.9 * 2) / 2);

/** The one-line note for Free and Starter on a low day (spec §7, §1): at most once a day, never during a session. */
export const LOW_DAY_UPSELL = "On Coaching, today's session would be lighter.";
