/**
 * Journey and milestones (docs/TIERS-AND-BODY-SPEC.md §8). Derived on read from the permanent records (set logs and
 * finished sessions), so nothing extra is stored and nothing goes stale. Pure. Low-day sessions count: they're real lifts.
 */
export type JourneyLog = { exerciseId: string; loadKg: number | null; reps: number | null; at: Date };
export type Lift = { exercise_id: string; sets: number; first_on: string; first_kg: number; best_kg: number; best_reps: number; best_on: string; now_kg: number };
export type Journey = {
  first_session_on: string | null;
  sessions_done: number;
  blocks_finished: number;
  longest_week_streak: number;
  session_milestones: { count: number; reached_on: string }[];
  next_milestone: number | null;
  lifts: Lift[];
};

export const SESSION_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
export const MAIN_LIFTS = 6;
const NOW_WINDOW_DAYS = 28;
const day = (d: Date) => d.toISOString().slice(0, 10);
/** Monday-based week number (UTC), for the weekly streak. */
const weekOf = (d: Date) => Math.floor((Math.floor(d.getTime() / 86_400_000) + 3) / 7);

export function journeyFrom(logs: JourneyLog[], sessionsDoneAt: Date[], blocksFinished: number, now = new Date()): Journey {
  const done = [...sessionsDoneAt].sort((a, b) => a.getTime() - b.getTime());
  const weeks = [...new Set(done.map(weekOf))].sort((a, b) => a - b);
  let longest = 0, run = 0;
  for (const [i, w] of weeks.entries()) {
    run = i > 0 && w === weeks[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const milestones = SESSION_MILESTONES.filter((m) => done.length >= m).map((m) => ({ count: m, reached_on: day(done[m - 1]!) }));

  const byLift = new Map<string, JourneyLog[]>();
  for (const l of logs) if (l.loadKg !== null && l.loadKg > 0) byLift.set(l.exerciseId, [...(byLift.get(l.exerciseId) ?? []), l]);
  const since = now.getTime() - NOW_WINDOW_DAYS * 86_400_000;
  const lifts: Lift[] = [...byLift].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    const first = sorted[0]!;
    // Best: the heaviest load; at equal load, more reps; at equal both, the earlier date (when it was first reached).
    const best = sorted.reduce((b, l) => (l.loadKg! > b.loadKg! || (l.loadKg === b.loadKg && (l.reps ?? 0) > (b.reps ?? 0)) ? l : b), first);
    const recent = sorted.filter((l) => l.at.getTime() >= since);
    const nowKg = recent.length ? Math.max(...recent.map((l) => l.loadKg!)) : sorted.at(-1)!.loadKg!;
    return { exercise_id: id, sets: sorted.length, first_on: day(first.at), first_kg: first.loadKg!, best_kg: best.loadKg!, best_reps: best.reps ?? 0, best_on: day(best.at), now_kg: nowKg };
  }).sort((a, b) => b.sets - a.sets || a.exercise_id.localeCompare(b.exercise_id)).slice(0, MAIN_LIFTS);

  return {
    first_session_on: done.length ? day(done[0]!) : null,
    sessions_done: done.length,
    blocks_finished: blocksFinished,
    longest_week_streak: longest,
    session_milestones: milestones,
    next_milestone: SESSION_MILESTONES.find((m) => m > done.length) ?? null,
    lifts,
  };
}
