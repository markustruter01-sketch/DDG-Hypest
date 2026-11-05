import { and, asc, eq, gte } from "drizzle-orm";
import { bodyMetricsTable, db, morningCheckinsTable, painEventsTable } from "@workspace/db";
import { localDayStart } from "../lib/timezone";
import { canAdapt, type Access } from "./access";
import { dayOf } from "./allowance";
import { LOW_DAY_UPSELL, lowDayReason, type Checkin } from "./readiness";

/** Body metrics and the morning check-in (docs/TIERS-AND-BODY-SPEC.md §6, §7). */

export async function todayCheckin(userId: number, timezone: string | null, now = new Date()): Promise<Checkin | null> {
  const [c] = await db.select({ sleepHalfHours: morningCheckinsTable.sleepHalfHours, energy: morningCheckinsTable.energy, soreness: morningCheckinsTable.soreness })
    .from(morningCheckinsTable).where(and(eq(morningCheckinsTable.userId, userId), eq(morningCheckinsTable.day, dayOf(now, timezone))));
  return c ?? null;
}

/** Today's low-day line for Coaching and Pro, or null (no check-in, not low, or not in the tier). */
export async function lowDayFor(userId: number, timezone: string | null, access: Access, now = new Date()): Promise<string | null> {
  if (!canAdapt(access)) return null;
  return lowDayReason(await todayCheckin(userId, timezone, now));
}

/**
 * Free and Starter on a low day: the one-line note (spec §7). Never on a day with a pain report (nobody is sold
 * anything when they're hurt); the app shows it on Progress only, never during a session.
 */
export async function lowDayUpsell(userId: number, timezone: string | null, access: Access, now = new Date()): Promise<string | null> {
  if (canAdapt(access) || !lowDayReason(await todayCheckin(userId, timezone, now))) return null;
  const [pain] = await db.select({ id: painEventsTable.id }).from(painEventsTable)
    .where(and(eq(painEventsTable.userId, userId), gte(painEventsTable.createdAt, localDayStart(now, timezone)))).limit(1);
  return pain ? null : LOW_DAY_UPSELL;
}

/** Pure: the 7-day moving average of daily weights (days without a weight are skipped). */
export function movingAverage(rows: { day: string; weightKg: number | null }[]): { day: string; weight_kg: number }[] {
  const w = rows.filter((r): r is { day: string; weightKg: number } => r.weightKg !== null).sort((a, b) => a.day.localeCompare(b.day));
  return w.map((r, i) => {
    const from = new Date(Date.parse(`${r.day}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
    const win = w.slice(0, i + 1).filter((x) => x.day >= from);
    return { day: r.day, weight_kg: Math.round((win.reduce((a, x) => a + x.weightKg, 0) / win.length) * 10) / 10 };
  });
}

export async function bodyRows(userId: number, days = 120, now = new Date()) {
  const from = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return db.select({ day: bodyMetricsTable.day, weightKg: bodyMetricsTable.weightKg, waistCm: bodyMetricsTable.waistCm }).from(bodyMetricsTable)
    .where(and(eq(bodyMetricsTable.userId, userId), gte(bodyMetricsTable.day, from))).orderBy(asc(bodyMetricsTable.day));
}
