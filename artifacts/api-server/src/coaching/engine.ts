/**
 * Rule-based plan engine. Builds a 4-week block ONLY from the exercise library, then a
 * validator checks every item. All numbers here are DRAFT rules for the exercise physiologist
 * to review. The AI layer (later) may only rephrase and reorder inside what this allows.
 */
import {
  COACH_BY_ID,
  EXERCISE_BY_ID,
  EXERCISES,
  type Area,
  type Coach,
  type Equipment,
  type Exercise,
  type Experience,
  type Goal,
  type Pattern,
} from "./library";

export const WEEKS = 4;
const SLOTS_BY_MINUTES: Record<number, number> = { 20: 3, 30: 4, 45: 5, 60: 6 };
const MAX_LEVEL: Record<Experience, number> = { beginner: 1, intermediate: 2, advanced: 3 };

export type PlanInput = {
  coachId: string;
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  minutes: number;
  equipment: Equipment[];
  avoidAreas: Area[];
  /** 1 for the first block; each next block shifts exercise choice for variety. */
  block: number;
  /** From Tier 2 logs: next target load per exercise id (kg). */
  targetLoads?: Record<string, number>;
};

export type PlanItem = {
  exerciseId: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  restSeconds: number;
  targetLoadKg: number | null;
};
export type PlanSession = { week: number; day: number; title: string; items: PlanItem[] };
export type Plan = { coachId: string; weeks: number; sessions: PlanSession[] };

/** Base dose for a rep-based exercise, by goal and experience (DRAFT). */
function repDose(goal: Goal, experience: Experience, ex: Exercise): { sets: number; reps: number; rest: number } {
  if (ex.pattern === "plyo") return { sets: 3, reps: experience === "beginner" ? 5 : 6, rest: 90 };
  switch (goal) {
    case "strength":
      return experience === "beginner" ? { sets: 3, reps: 8, rest: 120 } : { sets: 4, reps: 5, rest: 150 };
    case "muscle":
      return { sets: 3, reps: 10, rest: 90 };
    case "performance":
      return { sets: 4, reps: 5, rest: 120 };
    default:
      return { sets: experience === "beginner" ? 2 : 3, reps: 12, rest: 45 };
  }
}

/** Base dose for a time-based exercise (DRAFT). */
function timeDose(experience: Experience, ex: Exercise, minutes: number, coach: Coach): { sets: number; seconds: number; rest: number } {
  // Cardio is the main work for endurance; a short warm-up block for everyone else.
  if (ex.pattern === "cardio") return { sets: 1, seconds: Math.max(5, Math.round(minutes * (coach.discipline === "endurance" ? 0.6 : 0.2))) * 60, rest: 0 };
  if (ex.pattern === "intervals") return { sets: experience === "beginner" ? 5 : 8, seconds: 30, rest: 90 };
  if (ex.pattern === "carry") return { sets: 3, seconds: 30, rest: 60 };
  if (ex.pattern === "rest_pose") return { sets: 1, seconds: 120, rest: 0 };
  return { sets: 2, seconds: experience === "beginner" ? 30 : 45, rest: 15 };
}

/** Week-by-week change inside a block: build for 3 weeks, lighter week 4 (DRAFT). */
function progress(item: PlanItem, week: number): PlanItem {
  if (week === WEEKS) return { ...item, sets: Math.max(1, item.sets - 1) };
  const step = week - 1;
  return {
    ...item,
    reps: item.reps === null ? null : item.reps + step,
    seconds: item.seconds === null || item.sets === 1 ? item.seconds : item.seconds + 5 * step,
  };
}

export function fits(ex: Exercise, input: Pick<PlanInput, "equipment" | "avoidAreas" | "experience">): boolean {
  const hasKit = ex.equipment.length === 0 || ex.equipment.some((e) => input.equipment.includes(e));
  const safe = !ex.loads.some((a) => input.avoidAreas.includes(a));
  return hasKit && safe && ex.level <= MAX_LEVEL[input.experience];
}

/** If nothing safe fits a pattern, try these instead, in order (DRAFT). */
const FALLBACK: Partial<Record<Pattern, Pattern[]>> = {
  intervals: ["cardio", "core"],
  plyo: ["lunge", "squat", "core"],
  squat: ["lunge", "hinge", "core"],
  lunge: ["squat", "hinge", "core"],
  hinge: ["core"],
  push: ["core"],
  pull: ["core"],
  carry: ["core"],
  standing: ["balance", "spine", "rest_pose"],
  balance: ["spine", "rest_pose"],
  flow: ["spine", "rest_pose"],
  hips: ["spine", "rest_pose"],
  spine: ["rest_pose"],
  cardio: ["core"],
};

function pick(coach: Coach, pattern: Pattern, input: PlanInput, offset: number, used: Set<string>): Exercise | null {
  for (const p of [pattern, ...(FALLBACK[pattern] ?? [])]) {
    const options = EXERCISES.filter((e) => e.pattern === p && e.disciplines.includes(coach.discipline) && fits(e, input) && !used.has(e.id));
    if (options.length === 0) continue;
    // Prefer the coach's own signature moves when there are at least two (keeps variety), then
    // moves that use the member's own equipment; bodyweight only when nothing else fits.
    const signature = options.filter((e) => e.disciplines[0] === coach.discipline);
    const styled = signature.length >= 2 ? signature : options;
    const withKit = styled.filter((e) => e.equipment.length > 0);
    const pool = withKit.length > 0 ? withKit : styled;
    return pool.at(offset % pool.length) ?? null;
  }
  return null;
}

/** Best safe replacement for an exercise: its listed swaps first, then anything of the same pattern. */
export function findSwap(ex: Exercise, input: Pick<PlanInput, "equipment" | "avoidAreas" | "experience">, coach: Coach): Exercise | null {
  for (const id of ex.swaps) {
    const s = EXERCISE_BY_ID.get(id);
    if (s && fits(s, input)) return s;
  }
  return EXERCISES.find((e) => e.id !== ex.id && e.pattern === ex.pattern && e.disciplines.includes(coach.discipline) && fits(e, input)) ?? null;
}

const DAY_NAMES = ["Day A", "Day B", "Day C"];

export function buildPlan(input: PlanInput): Plan {
  const coach = COACH_BY_ID.get(input.coachId);
  if (!coach) throw new Error(`unknown coach ${input.coachId}`);
  const slots = SLOTS_BY_MINUTES[input.minutes] ?? 4;

  // One template week, then repeated with weekly progression.
  const templateWeek: { title: string; items: PlanItem[] }[] = [];
  for (let day = 1; day <= input.daysPerWeek; day += 1) {
    const t = (day - 1) % coach.dayTemplates.length;
    const patterns = (coach.dayTemplates.at(t) ?? []).slice(0, slots);
    const used = new Set<string>();
    const items: PlanItem[] = [];
    patterns.forEach((pattern, slot) => {
      const ex = pick(coach, pattern, input, input.block - 1 + day + slot, used);
      if (!ex) return;
      used.add(ex.id);
      if (ex.measure === "reps") {
        const d = repDose(input.goal, input.experience, ex);
        items.push({ exerciseId: ex.id, sets: d.sets, reps: d.reps, seconds: null, restSeconds: d.rest, targetLoadKg: ex.weighted ? input.targetLoads?.[ex.id] ?? null : null });
      } else {
        const d = timeDose(input.experience, ex, input.minutes, coach);
        items.push({ exerciseId: ex.id, sets: d.sets, reps: null, seconds: d.seconds, restSeconds: d.rest, targetLoadKg: ex.weighted ? input.targetLoads?.[ex.id] ?? null : null });
      }
    });
    templateWeek.push({ title: `${DAY_NAMES.at(t) ?? `Day ${day}`} · ${coach.title}`, items });
  }

  const sessions: PlanSession[] = [];
  for (let week = 1; week <= WEEKS; week += 1) {
    templateWeek.forEach((d, i) => sessions.push({ week, day: i + 1, title: d.title, items: d.items.map((it) => progress(it, week)) }));
  }
  const plan = { coachId: coach.id, weeks: WEEKS, sessions };
  const problems = validatePlan(plan, input);
  if (problems.length > 0) throw new Error(`plan failed checks: ${problems.join("; ")}`);
  return plan;
}

/** Every plan, from rules or AI, must pass this before a member sees it. */
export function validatePlan(plan: Plan, input: Pick<PlanInput, "equipment" | "avoidAreas" | "experience" | "daysPerWeek">): string[] {
  const problems: string[] = [];
  if (plan.sessions.length !== input.daysPerWeek * WEEKS) problems.push("wrong number of sessions");
  for (const s of plan.sessions) {
    if (s.items.length === 0) problems.push(`week ${s.week} day ${s.day} is empty`);
    for (const it of s.items) {
      const ex = EXERCISE_BY_ID.get(it.exerciseId);
      if (!ex) { problems.push(`unknown exercise ${it.exerciseId}`); continue; }
      if (!fits(ex, input)) problems.push(`${ex.id} does not fit equipment, level or areas to avoid`);
      if (it.sets < 1 || it.sets > 8) problems.push(`${ex.id} sets out of range`);
      if ((it.reps === null) === (it.seconds === null)) problems.push(`${ex.id} needs reps or time`);
      if (it.reps !== null && (it.reps < 1 || it.reps > 30)) problems.push(`${ex.id} reps out of range`);
      if (it.seconds !== null && (it.seconds < 10 || it.seconds > 3600)) problems.push(`${ex.id} time out of range`);
      if (it.restSeconds < 0 || it.restSeconds > 300) problems.push(`${ex.id} rest out of range`);
    }
  }
  return problems;
}

/** Tier 2: next target load from logs. Hit every target rep in the last logged week → about +5% (DRAFT). */
export function nextLoads(logs: { exerciseId: string; targetReps: number | null; reps: number | null; loadKg: number | null }[]): Record<string, number> {
  const byEx = new Map<string, { best: number; allHit: boolean }>();
  for (const l of logs) {
    if (l.loadKg === null) continue;
    const cur = byEx.get(l.exerciseId) ?? { best: 0, allHit: true };
    cur.best = Math.max(cur.best, l.loadKg);
    if (l.targetReps !== null && (l.reps ?? 0) < l.targetReps) cur.allHit = false;
    byEx.set(l.exerciseId, cur);
  }
  const out: Record<string, number> = {};
  for (const [id, v] of byEx) {
    out[id] = Math.round((v.allHit ? v.best * 1.05 : v.best) * 2) / 2;
  }
  return out;
}
