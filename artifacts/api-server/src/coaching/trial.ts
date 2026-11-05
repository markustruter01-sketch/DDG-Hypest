import { and, asc, eq } from "drizzle-orm";
import { db, planItemsTable, planSessionsTable, plansTable, setLogsTable, trainingProfilesTable } from "@workspace/db";
import { buildPlan } from "./engine";
import { savePlan, toInput } from "./plan-store";
import { promptFor } from "./prompts";
import type { Answers } from "./profile";

/**
 * The free session before signup (docs/TIERS-AND-BODY-SPEC.md §4.2). The visitor's sets ride in the onboarding draft;
 * AT SIGNUP ONLY the Free block is built and the sets are written to week 1, day 1 by position and exercise id. A
 * position whose exercise changed (the answers were edited after the trial) is skipped.
 */
export type TrialSet = { position: number; exercise_id: string; set_number: number; reps: number | null; seconds: number | null; load_kg: number | null };
export type Trial = { finished: boolean; sets: TrialSet[] };

/** Pure: sets checked against the same ranges as a logged set (LogSetBody), at most 12 positions × 8 sets. */
export function cleanTrial(raw: unknown): Trial | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { finished?: unknown; sets?: unknown };
  if (!Array.isArray(t.sets)) return null;
  const sets: TrialSet[] = [];
  const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : undefined);
  for (const s of t.sets.slice(0, 96)) {
    if (!s || typeof s !== "object") continue;
    const x = s as Record<string, unknown>;
    const position = int(x["position"], 1, 12), set = int(x["set_number"], 1, 8);
    if (position === undefined || set === undefined || typeof x["exercise_id"] !== "string") continue;
    const reps = x["reps"] === null ? null : int(x["reps"], 0, 200);
    const seconds = x["seconds"] === null ? null : int(x["seconds"], 0, 7200);
    const load = x["load_kg"] === null ? null : typeof x["load_kg"] === "number" && x["load_kg"] >= 0 && x["load_kg"] <= 1000 ? x["load_kg"] : undefined;
    if (reps === undefined || seconds === undefined || load === undefined) continue;
    sets.push({ position, exercise_id: (x["exercise_id"] as string).slice(0, 60), set_number: set, reps, seconds, load_kg: load });
  }
  return { finished: t.finished === true, sets };
}

/** At signup: build the Free block (only if the member has none) and carry the trial's sets into week 1, day 1. */
export async function carryTrial(userId: number, trial: Trial): Promise<boolean> {
  const [profile] = await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
  if (!profile) return false;
  const existing = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.userId, userId)).limit(1);
  if (existing.length) return false;
  const answers = {
    coach_id: profile.coachId, goal: profile.goal, experience: profile.experience, days_per_week: profile.daysPerWeek, minutes: profile.minutes,
    equipment: profile.equipment, avoid_areas: profile.avoidAreas, units: profile.units, health_accepted: true,
  } as Answers;
  const input = toInput(answers, 1);
  const built = buildPlan(input);
  const planId = await savePlan(userId, built, input, 1, promptFor(built.coachId).lines.planIntro);
  const [day1] = await db.select({ id: planSessionsTable.id }).from(planSessionsTable)
    .where(and(eq(planSessionsTable.planId, planId), eq(planSessionsTable.week, 1), eq(planSessionsTable.day, 1)));
  if (!day1) return false;
  const items = await db.select().from(planItemsTable).where(eq(planItemsTable.sessionId, day1.id)).orderBy(asc(planItemsTable.position));
  let written = 0;
  for (const s of trial.sets) {
    const item = items.find((i) => i.position === s.position);
    if (!item || item.exerciseId !== s.exercise_id || s.set_number > item.sets) continue;
    await db.insert(setLogsTable).values({ itemId: item.id, exerciseId: item.exerciseId, setNumber: s.set_number, reps: s.reps, seconds: s.seconds, loadKg: s.load_kg })
      .onConflictDoNothing();
    written += 1;
  }
  if (trial.finished && written > 0) await db.update(planSessionsTable).set({ completedAt: new Date() }).where(eq(planSessionsTable.id, day1.id));
  return true;
}
