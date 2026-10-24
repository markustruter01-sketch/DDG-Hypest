import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { db, planSessionsTable, plansTable, remindersTable, usersTable } from "@workspace/db";
import { COACH_BY_ID } from "./library";
import { emailOn, sendEmail, siteUrl } from "../lib/email";
import { logger } from "../lib/logger";

/** A member with reminders on, an active plan and no finished session for this many days gets one email. */
export const REMIND_AFTER_DAYS = 3;
/** Most emails one daily run sends (keeps a run short). */
export const MAX_PER_RUN = 200;

export async function remindersOn(userId: number): Promise<boolean> {
  const [row] = await db.select({ id: remindersTable.userId }).from(remindersTable).where(eq(remindersTable.userId, userId));
  return Boolean(row);
}

export async function setReminders(userId: number, on: boolean): Promise<void> {
  if (!on) return void (await db.delete(remindersTable).where(eq(remindersTable.userId, userId)));
  await db.insert(remindersTable).values({ userId, token: randomBytes(32).toString("base64url") }).onConflictDoNothing();
}

/** The "turn these off" link. Unknown tokens do nothing (same answer either way). */
export async function turnOffByToken(token: string): Promise<void> {
  await db.delete(remindersTable).where(eq(remindersTable.token, token));
}

export type Due = { userId: number; email: string; name: string; token: string; coachId: string; planId: number; lastActive: Date };

/** Pure: is this member due? Inactive long enough, and not already emailed during this break. */
export function isDue(lastActive: Date, lastSentAt: Date | null, now = new Date()): boolean {
  if (now.getTime() - lastActive.getTime() < REMIND_AFTER_DAYS * 86_400_000) return false;
  return lastSentAt === null || lastSentAt < lastActive;
}

/** Pure: the email. Fixed wording (no AI). */
export function reminderEmail(d: { name: string; coachName: string; days: number; week: number; day: number; title: string; sessionUrl: string; offUrl: string }) {
  return {
    subject: "Your next session is ready",
    text: [
      `Hi ${d.name},`,
      "",
      `${d.coachName} here. It's been ${d.days} days since your last session. Your next one is ready: week ${d.week}, day ${d.day}, ${d.title}.`,
      "",
      `Start it: ${d.sessionUrl}`,
      "",
      "Short on time? Do the first exercise. It still counts.",
      "",
      `Don't want these emails? Turn them off: ${d.offUrl}`,
    ].join("\n"),
  };
}

/** Daily job: emails every member who is due. Returns counts. Never throws for one member's failure. */
export async function sendDueReminders(now = new Date()): Promise<{ due: number; sent: number; skipped?: string }> {
  const site = siteUrl();
  if (!emailOn() || !site) return { due: 0, sent: 0, skipped: "email is off" };
  const lastDone = db
    .select({ planId: planSessionsTable.planId, at: max(planSessionsTable.completedAt).as("at") })
    .from(planSessionsTable)
    .groupBy(planSessionsTable.planId)
    .as("last_done");
  const rows = await db
    .select({
      userId: remindersTable.userId, token: remindersTable.token, lastSentAt: remindersTable.lastSentAt,
      email: usersTable.email, name: usersTable.displayName, planId: plansTable.id, coachId: plansTable.coachId,
      lastActive: sql<Date>`coalesce(${lastDone.at}, ${plansTable.createdAt})`.mapWith((v) => new Date(v)),
    })
    .from(remindersTable)
    .innerJoin(usersTable, eq(usersTable.id, remindersTable.userId))
    .innerJoin(plansTable, and(eq(plansTable.userId, remindersTable.userId), eq(plansTable.status, "active")))
    .leftJoin(lastDone, eq(lastDone.planId, plansTable.id));
  const candidates = rows.filter((r) => isDue(r.lastActive, r.lastSentAt, now)).slice(0, MAX_PER_RUN);

  let due = 0, sent = 0;
  for (const r of candidates) {
    const [next] = await db
      .select({ id: planSessionsTable.id, week: planSessionsTable.week, day: planSessionsTable.day, title: planSessionsTable.title })
      .from(planSessionsTable)
      .where(and(eq(planSessionsTable.planId, r.planId), isNull(planSessionsTable.completedAt)))
      .orderBy(asc(planSessionsTable.week), asc(planSessionsTable.day))
      .limit(1);
    if (!next) continue; // block finished: nothing waiting
    due += 1;
    const days = Math.floor((now.getTime() - r.lastActive.getTime()) / 86_400_000);
    const mail = reminderEmail({
      name: r.name, coachName: COACH_BY_ID.get(r.coachId)?.name ?? "Your coach", days, week: next.week, day: next.day, title: next.title,
      sessionUrl: `${site}/session/${next.id}`, offUrl: `${site}/reminders/off?token=${r.token}`,
    });
    if (await sendEmail(r.email, mail.subject, mail.text)) {
      sent += 1;
      await db.update(remindersTable).set({ lastSentAt: now }).where(eq(remindersTable.userId, r.userId));
    }
  }
  logger.info({ due, sent }, "reminders run");
  return { due, sent };
}
