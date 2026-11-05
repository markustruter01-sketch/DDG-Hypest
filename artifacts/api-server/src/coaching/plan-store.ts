import { aiOn } from "../lib/ai";
import { db, planItemsTable, planSessionsTable, plansTable } from "@workspace/db";
import type { Plan, PlanInput } from "./engine";
import type { Answers } from "./profile";

/** Saving a rules-built block (shared by the plan routes and the free-trial signup, spec 3.1 §4.2). */
export function toInput(a: Answers, block: number, targetLoads?: Record<string, number>): PlanInput {
  return {
    coachId: a.coach_id, goal: a.goal, experience: a.experience, daysPerWeek: a.days_per_week, minutes: a.minutes,
    equipment: [...new Set(a.equipment)], avoidAreas: [...new Set(a.avoid_areas)], block, targetLoads,
  };
}

/** fixedIntro: Free's block gets the coach's fixed welcome and no AI notes (spec 3.1 §2: Free spend is zero). */
export async function savePlan(userId: number, plan: Plan, input: PlanInput, block: number, fixedIntro: string | null = null): Promise<number> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(plansTable)
      .values({ userId, coachId: plan.coachId, block, weeks: plan.weeks, status: "active", engine: "rules", record: { input, plan },
        notesStatus: aiOn() && fixedIntro === null ? "pending" : "none", intro: fixedIntro })
      .returning({ id: plansTable.id });
    if (!row) throw new Error("plan insert failed");
    for (const s of plan.sessions) {
      const [sess] = await tx.insert(planSessionsTable).values({ planId: row.id, week: s.week, day: s.day, title: s.title }).returning({ id: planSessionsTable.id });
      if (!sess) throw new Error("session insert failed");
      if (s.items.length > 0) {
        await tx.insert(planItemsTable).values(s.items.map((it, i) => ({
          sessionId: sess.id, position: i + 1, exerciseId: it.exerciseId, sets: it.sets, reps: it.reps, seconds: it.seconds,
          restSeconds: it.restSeconds, targetLoadKg: it.targetLoadKg,
        })));
      }
    }
    return row.id;
  });
}
