import { and, eq, lt, sql } from "drizzle-orm";
import { aiLedgerDailyTable, aiLedgerMonthlyTable, allowancesTable, db, memberCapsTable } from "@workspace/db";
import type { Kind } from "../lib/ai";
import type { Level } from "./access";
import { localDay } from "../lib/timezone";

/**
 * AI allowances and the per-member ledger (docs/COACH-AGENT-SPEC.md §5, §7). The numbers below are the DEFAULTS,
 * written to the `allowances` table at start-up only where a row is missing; from then on the table is the one
 * place they live (Markus can change a row without a deploy).
 */
export const KINDS: Kind[] = ["chat", "daily_note", "plan_notes", "weekly_review", "checkin", "meal_log", "meal_plan", "midweek_check", "monthly_report"];
type Row = { perDay: number; perMonth: number };
const none: Row = { perDay: 0, perMonth: 0 };
const r = (perDay: number, perMonth: number): Row => ({ perDay, perMonth });
/** docs/TIERS-AND-BODY-SPEC.md §2 (Markus, 5 Nov 2026). Free makes no AI calls at all: its plan notes are fixed lines. */
const FREE: Record<Kind, Row> = { chat: none, daily_note: none, plan_notes: none, weekly_review: none, checkin: none, meal_log: none, meal_plan: none, midweek_check: none, monthly_report: none };
export const DEFAULT_ALLOWANCES: Record<Level, Record<Kind, Row>> = {
  none: FREE,
  // Legacy one-off credit: Free's allowances, plus AI notes on the block it paid for.
  plan: { ...FREE, plan_notes: r(3, 3) },
  // Starter: a small taste of the coach. No swaps, load changes, reviews or food AI: those are Coaching.
  tier1: { ...FREE, chat: r(3, 60), daily_note: r(1, 31), plan_notes: r(3, 3), checkin: r(2, 8) },
  tier2: { ...FREE, chat: r(20, 300), daily_note: r(1, 31), plan_notes: r(3, 3), weekly_review: r(1, 5), checkin: r(2, 8), meal_log: r(5, 100), meal_plan: r(2, 10) },
  tier3: { chat: r(40, 600), daily_note: r(1, 31), plan_notes: r(3, 3), weekly_review: r(1, 5), checkin: r(2, 8), meal_log: r(10, 200), meal_plan: r(3, 15), midweek_check: r(1, 5), monthly_report: r(1, 1) },
};

/** Spec 3.1 §2: the most a member's AI may cost in a UTC month, per tier (defaults for the member_caps table). */
export const DEFAULT_CAPS_MICRO_USD: Record<Level, number> = { none: 0, plan: 100_000, tier1: 500_000, tier2: 2_000_000, tier3: 3_500_000 };

/** Meal plans per local week (spec 3.1 §2: a plan plus rebuilds), counted in code; the allowance rows are the backstop. */
export const MEAL_PLANS_PER_WEEK: Record<Level, number> = { none: 0, plan: 0, tier1: 0, tier2: 2, tier3: 3 };

/** Which agent tools each tier's chat may use (Phase 2 spec §2; Starter per Markus, 5 Nov 2026). */
export const CHAT_TOOLS: Record<Level, string[]> = {
  none: [],
  plan: [],
  tier1: ["write_memory", "build_block", "schedule_checkin"],
  tier2: ["build_block", "swap_exercise", "set_target_load", "write_memory", "schedule_checkin"],
  tier3: ["build_block", "swap_exercise", "set_target_load", "write_memory", "schedule_checkin"],
};

export async function seedAllowances(): Promise<void> {
  const rows = (Object.keys(DEFAULT_ALLOWANCES) as Level[]).flatMap((tier) =>
    KINDS.map((kind) => ({ tier, kind, ...DEFAULT_ALLOWANCES[tier][kind] })));
  await db.insert(allowancesTable).values(rows).onConflictDoNothing();
  await db.insert(memberCapsTable).values((Object.keys(DEFAULT_CAPS_MICRO_USD) as Level[]).map((tier) => ({ tier, capMicroUsd: DEFAULT_CAPS_MICRO_USD[tier] }))).onConflictDoNothing();
}

export async function capFor(tier: Level): Promise<number> {
  const [row] = await db.select({ cap: memberCapsTable.capMicroUsd }).from(memberCapsTable).where(eq(memberCapsTable.tier, tier));
  return row?.cap ?? DEFAULT_CAPS_MICRO_USD[tier];
}

export async function allowanceFor(tier: Level, kind: Kind): Promise<Row> {
  const [row] = await db.select({ perDay: allowancesTable.perDay, perMonth: allowancesTable.perMonth }).from(allowancesTable)
    .where(and(eq(allowancesTable.tier, tier), eq(allowancesTable.kind, kind)));
  return row ?? DEFAULT_ALLOWANCES[tier][kind];
}

const MONTH_COLUMN = {
  chat: aiLedgerMonthlyTable.callsChat,
  daily_note: aiLedgerMonthlyTable.callsDailyNote,
  plan_notes: aiLedgerMonthlyTable.callsPlanNotes,
  weekly_review: aiLedgerMonthlyTable.callsWeeklyReview,
  checkin: aiLedgerMonthlyTable.callsCheckin,
  meal_log: aiLedgerMonthlyTable.callsMealLog,
  meal_plan: aiLedgerMonthlyTable.callsMealPlan,
  midweek_check: aiLedgerMonthlyTable.callsMidweekCheck,
  monthly_report: aiLedgerMonthlyTable.callsMonthlyReport,
} as const;
const MONTH_KEY = {
  chat: "callsChat", daily_note: "callsDailyNote", plan_notes: "callsPlanNotes", weekly_review: "callsWeeklyReview", checkin: "callsCheckin",
  meal_log: "callsMealLog", meal_plan: "callsMealPlan", midweek_check: "callsMidweekCheck", monthly_report: "callsMonthlyReport",
} as const;

/** UTC month, the same calendar as the global budget (spec §7). */
export const monthOf = (d: Date) => d.toISOString().slice(0, 7);
/** The member's local calendar day, YYYY-MM-DD. */
export const dayOf = (d: Date, tz: string | null) => new Date(localDay(d, tz) * 86_400_000).toISOString().slice(0, 10);

export type Reservation = { ok: true; month: string; estMicro: number } | { ok: false; why: "none" | "day" | "month" | "cap" };

class Refused extends Error {
  constructor(readonly why: "day" | "month" | "cap") { super(why); }
}

/**
 * Spec §7: reserve one turn of `kind`, atomically. Two taps at once can never both take the last call: each UPDATE
 * only succeeds while the count is under the limit, and Postgres re-checks that under the row lock.
 */
export async function reserveTurn(userId: number, tier: Level, kind: Kind, estMicro: number, timezone: string | null, now = new Date()): Promise<Reservation> {
  const limit = await allowanceFor(tier, kind);
  if (limit.perDay <= 0 || limit.perMonth <= 0) return { ok: false, why: "none" };
  const cap = await capFor(tier);
  const month = monthOf(now);
  const day = dayOf(now, timezone);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(aiLedgerDailyTable).values({ userId, day, kind }).onConflictDoNothing();
      await tx.insert(aiLedgerMonthlyTable).values({ userId, month }).onConflictDoNothing();
      const daily = await tx.update(aiLedgerDailyTable)
        .set({ calls: sql`${aiLedgerDailyTable.calls} + 1` })
        .where(and(eq(aiLedgerDailyTable.userId, userId), eq(aiLedgerDailyTable.day, day), eq(aiLedgerDailyTable.kind, kind), lt(aiLedgerDailyTable.calls, limit.perDay)))
        .returning({ calls: aiLedgerDailyTable.calls });
      if (!daily.length) throw new Refused("day");
      const col = MONTH_COLUMN[kind];
      const counted = await tx.update(aiLedgerMonthlyTable)
        .set({ [MONTH_KEY[kind]]: sql`${col} + 1` })
        .where(and(eq(aiLedgerMonthlyTable.userId, userId), eq(aiLedgerMonthlyTable.month, month), lt(col, limit.perMonth)))
        .returning({ id: aiLedgerMonthlyTable.userId });
      if (!counted.length) throw new Refused("month");
      const costed = await tx.update(aiLedgerMonthlyTable)
        .set({ costMicroUsd: sql`${aiLedgerMonthlyTable.costMicroUsd} + ${estMicro}` })
        .where(and(eq(aiLedgerMonthlyTable.userId, userId), eq(aiLedgerMonthlyTable.month, month), sql`${aiLedgerMonthlyTable.costMicroUsd} + ${estMicro} <= ${cap}`))
        .returning({ id: aiLedgerMonthlyTable.userId });
      if (!costed.length) throw new Refused("cap");
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, why: err.why };
    throw err;
  }
  return { ok: true, month, estMicro };
}

/** After the turn: swap the reserved estimate for the real cost. */
export async function settleTurn(userId: number, r: { month: string; estMicro: number }, actualMicro: number): Promise<void> {
  await db.update(aiLedgerMonthlyTable)
    .set({ costMicroUsd: sql`greatest(0, ${aiLedgerMonthlyTable.costMicroUsd} - ${r.estMicro} + ${actualMicro})` })
    .where(and(eq(aiLedgerMonthlyTable.userId, userId), eq(aiLedgerMonthlyTable.month, r.month)));
}

/** Calls used today and this month, for "N of M today" (step 2.4). */
export async function usage(userId: number, tier: Level, kind: Kind, timezone: string | null, now = new Date()) {
  const limit = await allowanceFor(tier, kind);
  const [d] = await db.select({ calls: aiLedgerDailyTable.calls }).from(aiLedgerDailyTable)
    .where(and(eq(aiLedgerDailyTable.userId, userId), eq(aiLedgerDailyTable.day, dayOf(now, timezone)), eq(aiLedgerDailyTable.kind, kind)));
  const [m] = await db.select({ calls: MONTH_COLUMN[kind] }).from(aiLedgerMonthlyTable)
    .where(and(eq(aiLedgerMonthlyTable.userId, userId), eq(aiLedgerMonthlyTable.month, monthOf(now))));
  return { usedToday: d?.calls ?? 0, perDay: limit.perDay, usedMonth: m?.calls ?? 0, perMonth: limit.perMonth };
}
