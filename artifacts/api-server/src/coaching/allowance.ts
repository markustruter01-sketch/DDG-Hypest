import { and, eq, lt, sql } from "drizzle-orm";
import { aiLedgerDailyTable, aiLedgerMonthlyTable, allowancesTable, db } from "@workspace/db";
import type { Kind } from "../lib/ai";
import type { Level } from "./access";
import { localDay } from "../lib/timezone";

/**
 * AI allowances and the per-member ledger (docs/COACH-AGENT-SPEC.md §5, §7). The numbers below are the DEFAULTS,
 * written to the `allowances` table at start-up only where a row is missing; from then on the table is the one
 * place they live (Markus can change a row without a deploy).
 */
export const KINDS: Kind[] = ["chat", "daily_note", "plan_notes", "weekly_review", "checkin"];
type Row = { perDay: number; perMonth: number };
const none: Row = { perDay: 0, perMonth: 0 };
export const DEFAULT_ALLOWANCES: Record<Level, Record<Kind, Row>> = {
  none: { chat: none, daily_note: none, plan_notes: { perDay: 3, perMonth: 3 }, weekly_review: none, checkin: none },
  plan: { chat: none, daily_note: none, plan_notes: { perDay: 3, perMonth: 3 }, weekly_review: none, checkin: none },
  // Plans: a small taste of the coach (Markus, 5 Nov 2026). No swaps or load changes: those stay Coaching.
  tier1: { chat: { perDay: 3, perMonth: 60 }, daily_note: { perDay: 1, perMonth: 31 }, plan_notes: { perDay: 3, perMonth: 3 }, weekly_review: none, checkin: { perDay: 2, perMonth: 8 } },
  tier2: { chat: { perDay: 20, perMonth: 300 }, daily_note: { perDay: 1, perMonth: 31 }, plan_notes: { perDay: 3, perMonth: 3 }, weekly_review: { perDay: 1, perMonth: 5 }, checkin: { perDay: 2, perMonth: 8 } },
};

/** Spec §7: no member costs more than this in a UTC month, whatever the tier (the build plan's red line). */
export const MEMBER_CAP_MICRO_USD = 1_500_000;

/** Which agent tools each tier's chat may use (spec §2, and Markus 5 Nov 2026 for Plans). */
export const CHAT_TOOLS: Record<Level, string[]> = {
  none: [],
  plan: [],
  tier1: ["write_memory", "build_block", "schedule_checkin"],
  tier2: ["build_block", "swap_exercise", "set_target_load", "write_memory", "schedule_checkin"],
};

export async function seedAllowances(): Promise<void> {
  const rows = (Object.keys(DEFAULT_ALLOWANCES) as Level[]).flatMap((tier) =>
    KINDS.map((kind) => ({ tier, kind, ...DEFAULT_ALLOWANCES[tier][kind] })));
  await db.insert(allowancesTable).values(rows).onConflictDoNothing();
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
} as const;
const MONTH_KEY = { chat: "callsChat", daily_note: "callsDailyNote", plan_notes: "callsPlanNotes", weekly_review: "callsWeeklyReview", checkin: "callsCheckin" } as const;

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
        .where(and(eq(aiLedgerMonthlyTable.userId, userId), eq(aiLedgerMonthlyTable.month, month), sql`${aiLedgerMonthlyTable.costMicroUsd} + ${estMicro} <= ${MEMBER_CAP_MICRO_USD}`))
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
