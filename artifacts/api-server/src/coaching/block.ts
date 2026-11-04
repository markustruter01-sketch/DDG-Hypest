import { and, asc, count, desc, eq, inArray, isNotNull, max, min, sql } from "drizzle-orm";
import { db, planItemsTable, planSessionsTable, plansTable, setLogsTable } from "@workspace/db";
import type { Plan, PlanInput } from "./engine";
import type { PlanNumbers } from "./output-filter";

/** The member's current block (active or paused) as the agent sees it: every session and item, with ids. */
export type BlockItem = {
  id: number; exerciseId: string; sets: number; reps: number | null; seconds: number | null; restSeconds: number;
  targetLoadKg: number | null; changeNote: string | null; logged: boolean;
};
export type BlockSession = { id: number; week: number; day: number; title: string; done: boolean; items: BlockItem[] };
export type Block = {
  planId: number; status: "active" | "paused"; pausedReason: string | null; coachId: string; block: number; createdAt: Date;
  /** The input the rules built this block from (plans.record.input). Changes are checked against it. */
  input: PlanInput;
  sessions: BlockSession[];
};

export async function currentBlock(userId: number): Promise<Block | null> {
  const [plan] = await db.select().from(plansTable)
    .where(and(eq(plansTable.userId, userId), inArray(plansTable.status, ["active", "paused"])))
    .orderBy(desc(plansTable.id)).limit(1);
  if (!plan) return null;
  const input = (plan.record as { input?: PlanInput }).input;
  if (!input) return null;
  const sessions = await db.select().from(planSessionsTable).where(eq(planSessionsTable.planId, plan.id))
    .orderBy(asc(planSessionsTable.week), asc(planSessionsTable.day));
  const items = sessions.length ? await db.select().from(planItemsTable).where(inArray(planItemsTable.sessionId, sessions.map((s) => s.id))).orderBy(asc(planItemsTable.position)) : [];
  const logged = items.length ? await db.selectDistinct({ itemId: setLogsTable.itemId }).from(setLogsTable).where(inArray(setLogsTable.itemId, items.map((i) => i.id))) : [];
  const loggedIds = new Set(logged.map((l) => l.itemId));
  return {
    planId: plan.id, status: plan.status as "active" | "paused", pausedReason: plan.pausedReason, coachId: plan.coachId, block: plan.block,
    createdAt: plan.createdAt, input,
    sessions: sessions.map((s) => ({
      id: s.id, week: s.week, day: s.day, title: s.title, done: s.completedAt !== null,
      items: items.filter((i) => i.sessionId === s.id).map((i) => ({
        id: i.id, exerciseId: i.exerciseId, sets: i.sets, reps: i.reps, seconds: i.seconds, restSeconds: i.restSeconds,
        targetLoadKg: i.targetLoadKg, changeNote: i.changeNote, logged: loggedIds.has(i.id),
      })),
    })),
  };
}

/** The block as the engine's Plan shape, for validatePlan. */
export function asPlan(b: Block): Plan {
  return {
    coachId: b.coachId, weeks: Math.max(0, ...b.sessions.map((s) => s.week)),
    sessions: b.sessions.map((s) => ({
      week: s.week, day: s.day, title: s.title,
      items: s.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets, reps: i.reps, seconds: i.seconds, restSeconds: i.restSeconds, targetLoadKg: i.targetLoadKg })),
    })),
  };
}

/** Every training number in the block, for the output filter (spec §6.5). */
export function planNumbers(b: Block | null): PlanNumbers {
  const items = b?.sessions.flatMap((s) => s.items) ?? [];
  const uniq = (xs: (number | null)[]) => [...new Set(xs.filter((x): x is number => x !== null))];
  return {
    sets: uniq(items.map((i) => i.sets)),
    reps: uniq(items.map((i) => i.reps)),
    seconds: uniq([...items.map((i) => i.seconds), ...items.map((i) => i.restSeconds)]),
    loadsKg: uniq(items.map((i) => i.targetLoadKg)),
  };
}

/** The week the member is in: the first week with a session not done, else the last week. */
export function currentWeek(b: Block): number {
  return b.sessions.find((s) => !s.done)?.week ?? Math.max(1, ...b.sessions.map((s) => s.week));
}

/**
 * The member's whole training history in a FIXED size (Markus, 5 Nov 2026: a 5-year member must not cost more per
 * message than a new one). One line per main exercise, worked out by the database each time: no old chat or logs
 * are ever sent to the model. At most 12 exercises, the ones they have logged most.
 */
export async function lifetimeSummary(userId: number, now = new Date()) {
  const recent = new Date(now.getTime() - 90 * 86_400_000);
  return db
    .select({
      exerciseId: setLogsTable.exerciseId,
      sets: count(),
      bestKg: max(setLogsTable.loadKg),
      // Where they started: the first load ever logged (Markus, 5 Nov 2026: never lose the start of the journey).
      firstKg: sql<number | null>`(array_agg(${setLogsTable.loadKg} order by ${setLogsTable.createdAt}) filter (where ${setLogsTable.loadKg} is not null))[1]`,
      bestRecentKg: sql<number | null>`max(${setLogsTable.loadKg}) filter (where ${setLogsTable.createdAt} >= ${recent})`,
      first: min(setLogsTable.createdAt),
      last: max(setLogsTable.createdAt),
    })
    .from(setLogsTable)
    .innerJoin(planItemsTable, eq(planItemsTable.id, setLogsTable.itemId))
    .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
    .innerJoin(plansTable, eq(plansTable.id, planSessionsTable.planId))
    .where(eq(plansTable.userId, userId))
    .groupBy(setLogsTable.exerciseId)
    .orderBy(desc(count()))
    .limit(12);
}

/** Logged sets for one member, newest first, with the exercise and the item's target reps (for nextLoads). */
export async function memberLogs(userId: number, since?: Date) {
  const rows = await db
    .select({
      exerciseId: setLogsTable.exerciseId, reps: setLogsTable.reps, loadKg: setLogsTable.loadKg, seconds: setLogsTable.seconds,
      at: setLogsTable.createdAt, targetReps: planItemsTable.reps, planId: planSessionsTable.planId, week: planSessionsTable.week,
    })
    .from(setLogsTable)
    .innerJoin(planItemsTable, eq(planItemsTable.id, setLogsTable.itemId))
    .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
    .innerJoin(plansTable, eq(plansTable.id, planSessionsTable.planId))
    .where(and(eq(plansTable.userId, userId), isNotNull(setLogsTable.createdAt)))
    .orderBy(desc(setLogsTable.createdAt))
    .limit(500);
  return since ? rows.filter((r) => r.at >= since) : rows;
}
