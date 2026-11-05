import { Router, type IRouter, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { GetBodyResponse, SaveBodyMetricsBody, SaveMorningCheckinBody } from "@workspace/api-zod";
import { bodyMetricsTable, db, monthlyReportsTable, morningCheckinsTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { accessFor } from "../coaching/access";
import { dayOf } from "../coaching/allowance";
import { bodyRows, lowDayFor, lowDayUpsell, movingAverage, todayCheckin } from "../coaching/body";
import { nutritionBlocked } from "../coaching/food";

/** Body metrics, the morning check-in and Pro's monthly reports (docs/TIERS-AND-BODY-SPEC.md §6, §7, §7b). Every tier. */
const router: IRouter = Router();
type User = ReturnType<typeof authUser>;

async function send(res: Response, user: User) {
  const access = await accessFor(user.id);
  const blocked = await nutritionBlocked(user.id);
  const rows = await bodyRows(user.id);
  const c = await todayCheckin(user.id, user.timezone);
  const reports = await db.select({ month: monthlyReportsTable.month, text: monthlyReportsTable.text }).from(monthlyReportsTable)
    .where(and(eq(monthlyReportsTable.userId, user.id), eq(monthlyReportsTable.status, "done"))).orderBy(desc(monthlyReportsTable.month)).limit(24);
  res.json(GetBodyResponse.parse({
    // Spec §5.1: a member with nutrition blocked sees the numbers only (no trend line).
    metrics: rows.map((r) => ({ day: r.day, weight_kg: r.weightKg, waist_cm: r.waistCm })),
    average_7d: blocked ? [] : movingAverage(rows),
    checkin_today: c ? { sleep_half_hours: c.sleepHalfHours, energy: c.energy, soreness: c.soreness } : null,
    low_day: await lowDayFor(user.id, user.timezone, access),
    upgrade_note: await lowDayUpsell(user.id, user.timezone, access),
    monthly_reports: reports.map((r) => ({ month: r.month, text: r.text ?? "" })),
  }));
}

router.get("/me/body", requireUser, async (_req, res) => send(res, authUser(res)));

// One row per day: a second entry that day replaces the first (a field left out keeps today's value).
router.put("/me/body", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = SaveBodyMetricsBody.strict().safeParse(req.body);
  if (!body.success || (body.data.weight_kg == null && body.data.waist_cm == null)) return void res.status(400).json({ message: "Add a weight or a waist measurement" });
  const day = dayOf(new Date(), user.timezone);
  const set = { ...(body.data.weight_kg != null ? { weightKg: body.data.weight_kg } : {}), ...(body.data.waist_cm != null ? { waistCm: body.data.waist_cm } : {}), at: new Date() };
  await db.insert(bodyMetricsTable).values({ userId: user.id, day, weightKg: body.data.weight_kg ?? null, waistCm: body.data.waist_cm ?? null })
    .onConflictDoUpdate({ target: [bodyMetricsTable.userId, bodyMetricsTable.day], set });
  await send(res, user);
});

router.delete("/me/body/today", requireUser, async (_req, res) => {
  const user = authUser(res);
  await db.delete(bodyMetricsTable).where(and(eq(bodyMetricsTable.userId, user.id), eq(bodyMetricsTable.day, dayOf(new Date(), user.timezone))));
  await send(res, user);
});

// One per local day; a second answer that day replaces the first. Sessions already started keep their numbers.
router.put("/me/checkin", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = SaveMorningCheckinBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: "invalid request" });
  const v = { sleepHalfHours: body.data.sleep_half_hours, energy: body.data.energy, soreness: body.data.soreness };
  await db.insert(morningCheckinsTable).values({ userId: user.id, day: dayOf(new Date(), user.timezone), ...v })
    .onConflictDoUpdate({ target: [morningCheckinsTable.userId, morningCheckinsTable.day], set: { ...v, at: new Date() } });
  await send(res, user);
});

export default router;
