import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  bodyMetricsTable, coachMessagesTable, db, mealLogsTable, mealPlansTable, nutritionProfilesTable, nutritionTargetsTable,
  trainingProfilesTable, usersTable,
} from "@workspace/db";
import { aiOn, callModel, costMicroUsd, globalBudgetAllows, type ContentBlock, type ImageBlock, type TextBlock } from "../lib/ai";
import { localWeekStart } from "../lib/timezone";
import { logger } from "../lib/logger";
import type { Access, Level } from "./access";
import { dayOf, MEAL_PLANS_PER_WEEK, reserveTurn, settleTurn, usage } from "./allowance";
import { EATING_FLAGS } from "./chat";
import type { Goal } from "./library";
import { ageFrom, targetsFor, weightForTargets, type Sex, type Targets } from "./nutrition";
import { checkMealPlan, jsonIn, MEAL_PLAN_FAILED, mealPlanPrompt, type MealPlan } from "./meal-plan";
import { checkMealItems, MEAL_LOG_FAILED, MEAL_LOG_SYSTEM, totalsOf, type MealItem } from "./meal-log";

/**
 * Nutrition-lite (docs/TIERS-AND-BODY-SPEC.md §5): the set-up, targets, the weekly meal plan and meal logging.
 * Who may use what: set-up and targets from Starter; meal plans and meal logging from Coaching. A blocked member
 * (users.nutrition_blocked) gets none of it.
 */
export const canFood = (a: Access) => a.level === "tier1" || a.level === "tier2" || a.level === "tier3";
export const canFoodAi = (a: Access) => a.level === "tier2" || a.level === "tier3";

export async function nutritionBlocked(userId: number): Promise<boolean> {
  const [u] = await db.select({ blocked: usersTable.nutritionBlocked }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.blocked ?? true;
}

/** Targets, worked out again when the day changes or `force` (a set-up save). Null without a set-up. */
export async function currentTargets(userId: number, timezone: string | null, force = false, now = new Date()): Promise<Targets & { stored: true } | null> {
  const [p] = await db.select().from(nutritionProfilesTable).where(eq(nutritionProfilesTable.userId, userId));
  const [tp] = await db.select({ goal: trainingProfilesTable.goal, days: trainingProfilesTable.daysPerWeek }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
  if (!p || !tp) return null;
  const today = dayOf(now, timezone);
  const [stored] = await db.select().from(nutritionTargetsTable).where(eq(nutritionTargetsTable.userId, userId));
  const weights = await db.select({ kg: bodyMetricsTable.weightKg }).from(bodyMetricsTable)
    .where(and(eq(bodyMetricsTable.userId, userId), sql`${bodyMetricsTable.weightKg} is not null`)).orderBy(desc(bodyMetricsTable.day)).limit(7);
  const t = targetsFor({
    sex: p.sex as Sex, age: ageFrom(p.birthYear, now), heightCm: p.heightCm, goal: tp.goal as Goal,
    weightKg: weightForTargets(p.weightKg, weights.map((w) => w.kg!).reverse()), daysPerWeek: tp.days,
  });
  if (force || !stored || stored.computedDay !== today) {
    const row = { kcal: t.kcal, proteinG: t.proteinG, floorKcal: t.floorKcal, ceilingKcal: t.ceilingKcal, maintenanceOnly: t.maintenanceOnly, computedDay: today, updatedAt: now };
    await db.insert(nutritionTargetsTable).values({ userId, ...row }).onConflictDoUpdate({ target: nutritionTargetsTable.userId, set: row });
    return { ...t, stored: true };
  }
  return { ...t, kcal: stored.kcal, proteinG: stored.proteinG, floorKcal: stored.floorKcal, ceilingKcal: stored.ceilingKcal, maintenanceOnly: stored.maintenanceOnly, stored: true };
}

/** Meal plans asked for in this member's week (failed and working attempts count too). */
export async function mealPlansThisWeek(userId: number, weekOf: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(mealPlansTable)
    .where(and(eq(mealPlansTable.userId, userId), eq(mealPlansTable.weekOf, weekOf)));
  return r?.n ?? 0;
}

/** `precall`: refused before any model call (nothing was spent). */
type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; message: string; precall?: boolean };

const textOf = (blocks: ContentBlock[]) => blocks.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("").trim();

/** One food AI call: the member's allowance and cap, the global budget, then the model. The call counts either way. */
async function foodCall(userId: number, level: Level, timezone: string | null, kind: "meal_plan" | "meal_log", args: {
  tier: "plan" | "quick"; system: string; content: string | ContentBlock[]; maxTokens: number; promptChars: number;
}): Promise<Outcome<string>> {
  if (!aiOn()) return { ok: false, status: 503, message: "This isn't switched on yet.", precall: true };
  // One call plus its one retry, priced as cache writes (the dearest case), so settling never lands above it.
  const est = 2 * costMicroUsd(args.tier, 0, args.maxTokens, Math.ceil(args.promptChars / 3) + 500, 0);
  if (!(await globalBudgetAllows(est))) return { ok: false, status: 503, message: "This can't be done right now. Try again later.", precall: true };
  const r = await reserveTurn(userId, level, kind, est, timezone);
  if (!r.ok) return { ok: false, status: 429, message: r.why === "none" ? "This isn't part of your plan." : "You've used this for now. It resets soon.", precall: true };
  const reply = await callModel({ tier: args.tier, kind, system: args.system, messages: [{ role: "user", content: args.content }], maxTokens: args.maxTokens, userId });
  await settleTurn(userId, r, reply.ok ? reply.costMicro : 0);
  if (!reply.ok) return { ok: false, status: 503, message: kind === "meal_plan" ? MEAL_PLAN_FAILED : MEAL_LOG_FAILED };
  return { ok: true, value: textOf(reply.content) };
}

/**
 * Spec §5.4: the week's meal plan. A row is claimed first (under a lock on the member), so two taps can't go past the
 * weekly limit; a failed attempt keeps its row (it counts) and shows nothing.
 */
export async function makeMealPlan(userId: number, level: Level, timezone: string | null, units: "kg" | "lb", now = new Date()): Promise<Outcome<MealPlan>> {
  const t = await currentTargets(userId, timezone, false, now);
  if (!t) return { ok: false, status: 409, message: "Set up food first" };
  if (!aiOn()) return { ok: false, status: 503, message: "This isn't switched on yet." };
  const [p] = await db.select({ avoid: nutritionProfilesTable.foodsToAvoid }).from(nutritionProfilesTable).where(eq(nutritionProfilesTable.userId, userId));
  const weekOf = localWeekStart(now, timezone);
  const limit = MEAL_PLANS_PER_WEEK[level];
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    const [r] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(mealPlansTable).where(and(eq(mealPlansTable.userId, userId), eq(mealPlansTable.weekOf, weekOf)));
    if ((r?.n ?? 0) >= limit) return null;
    const [row] = await tx.insert(mealPlansTable).values({ userId, weekOf, plan: { status: "working" } }).returning({ id: mealPlansTable.id });
    return row!.id;
  });
  if (claimed === null) return { ok: false, status: 429, message: `That's this week's meal plans used (${limit}). A new week starts on Monday.` };
  const avoid = p?.avoid ?? [];
  const prompt = mealPlanPrompt(t, avoid, units);
  const out = await foodCall(userId, level, timezone, "meal_plan", { tier: "plan", system: prompt.system, content: prompt.user, maxTokens: 4000, promptChars: prompt.system.length + prompt.user.length });
  if (!out.ok && out.precall) {
    // Refused before any call: the claim doesn't count against the week.
    await db.delete(mealPlansTable).where(eq(mealPlansTable.id, claimed));
    return out;
  }
  const plan = out.ok ? checkMealPlan(jsonIn(out.value), t, avoid) : null;
  await db.update(mealPlansTable).set({ plan: plan ?? { status: "failed" } }).where(eq(mealPlansTable.id, claimed));
  if (!plan) {
    if (out.ok) logger.warn({ userId }, "meal plan dropped by the checks");
    return { ok: false, status: 502, message: MEAL_PLAN_FAILED };
  }
  return { ok: true, value: plan };
}

/** Spec §5.5: estimate a meal from a sentence or a photo. The photo exists only for this call. */
export async function estimateMeal(userId: number, level: Level, timezone: string | null, input: { text: string } | { photo: ImageBlock["source"] }): Promise<Outcome<MealItem[]>> {
  const content: string | ContentBlock[] = "text" in input
    ? input.text
    : [{ type: "image", source: input.photo }, { type: "text", text: "Estimate this meal." }];
  const chars = "text" in input ? input.text.length : 6000; // an image is about 1,500 tokens at the app's size
  const out = await foodCall(userId, level, timezone, "meal_log", { tier: "quick", system: MEAL_LOG_SYSTEM, content, maxTokens: 600, promptChars: MEAL_LOG_SYSTEM.length + chars });
  if (!out.ok) return out;
  const items = checkMealItems(jsonIn(out.value));
  return items ? { ok: true, value: items } : { ok: false, status: 502, message: MEAL_LOG_FAILED };
}

export async function saveMealLog(userId: number, timezone: string | null, text: string, items: MealItem[], now = new Date()) {
  const t = totalsOf(items);
  const [row] = await db.insert(mealLogsTable).values({ userId, day: dayOf(now, timezone), text: text.slice(0, 300), items, kcal: t.kcal, proteinG: t.protein_g }).returning();
  return row!;
}

/** Everything the Food screen shows. */
export async function foodState(userId: number, access: Access, timezone: string | null, now = new Date()) {
  const blocked = await nutritionBlocked(userId);
  const allowed = canFood(access) && !blocked;
  const [p] = allowed ? await db.select().from(nutritionProfilesTable).where(eq(nutritionProfilesTable.userId, userId)) : [];
  const t = allowed && p ? await currentTargets(userId, timezone, false, now) : null;
  const day = dayOf(now, timezone);
  const meals = allowed ? await db.select().from(mealLogsTable).where(and(eq(mealLogsTable.userId, userId), eq(mealLogsTable.day, day))).orderBy(asc(mealLogsTable.id)) : [];
  const weekOf = localWeekStart(now, timezone);
  const plans = allowed && canFoodAi(access)
    ? await db.select({ plan: mealPlansTable.plan }).from(mealPlansTable).where(and(eq(mealPlansTable.userId, userId), eq(mealPlansTable.weekOf, weekOf))).orderBy(desc(mealPlansTable.id))
    : [];
  const latest = plans.find((x) => (x.plan as { days?: unknown }).days)?.plan as MealPlan | undefined;
  const logs = allowed && canFoodAi(access) ? await usage(userId, access.level, "meal_log", timezone, now) : null;
  return {
    blocked,
    available: canFood(access),
    can_use_ai: canFoodAi(access) && aiOn() && !blocked,
    setup: p ? { sex: p.sex as Sex, birth_year: p.birthYear, height_cm: p.heightCm, weight_kg: p.weightKg, foods_to_avoid: p.foodsToAvoid } : null,
    targets: t ? { kcal: t.kcal, protein_g: t.proteinG, maintenance_only: t.maintenanceOnly } : null,
    today: { day, kcal: meals.reduce((a, m) => a + m.kcal, 0), protein_g: meals.reduce((a, m) => a + m.proteinG, 0),
      meals: meals.map((m) => ({ id: m.id, text: m.text, items: m.items as MealItem[], kcal: m.kcal, protein_g: m.proteinG, at: m.at.toISOString() })) },
    meal_plan: latest ? { week_of: weekOf, days: latest.days, grocery: latest.grocery } : null,
    meal_plans_left: allowed && canFoodAi(access) ? Math.max(0, MEAL_PLANS_PER_WEEK[access.level] - plans.length) : 0,
    meal_logs_left_today: logs ? Math.max(0, Math.min(logs.perDay - logs.usedToday, logs.perMonth - logs.usedMonth)) : 0,
  };
}

/**
 * One-time backfill at deploy (spec §5.1), safe to run on every start: members whose stored chat or health check
 * already qualifies get the block. Only members not yet blocked are touched.
 */
export async function backfillNutritionBlocks(): Promise<number> {
  const words = or(...EATING_FLAGS.map((w) => sql`lower(${coachMessagesTable.text}) like ${`%${w}%`}`));
  const fromChat = await db.selectDistinct({ userId: coachMessagesTable.userId }).from(coachMessagesTable)
    .where(and(eq(coachMessagesTable.role, "member"), words));
  const fromCheck = await db.select({ userId: trainingProfilesTable.userId }).from(trainingProfilesTable)
    .where(sql`(${trainingProfilesTable.screening} ->> 'any_yes')::boolean is true`);
  const ids = [...new Set([...fromChat, ...fromCheck].map((r) => r.userId))];
  if (!ids.length) return 0;
  const done = await db.update(usersTable).set({ nutritionBlocked: true })
    .where(and(inArray(usersTable.id, ids), eq(usersTable.nutritionBlocked, false))).returning({ id: usersTable.id });
  return done.length;
}

/** Saved with the set-up: today's weight also goes into body metrics. */
export async function recordWeight(userId: number, timezone: string | null, kg: number, now = new Date()): Promise<void> {
  const day = dayOf(now, timezone);
  await db.insert(bodyMetricsTable).values({ userId, day, weightKg: kg })
    .onConflictDoUpdate({ target: [bodyMetricsTable.userId, bodyMetricsTable.day], set: { weightKg: kg, at: now } });
}

