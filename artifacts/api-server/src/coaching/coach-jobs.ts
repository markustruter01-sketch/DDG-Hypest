import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { checkinsTable, coachMessagesTable, db, membershipsTable, plansTable, remindersTable, trainingProfilesTable, usersTable, weeklyReviewsTable } from "@workspace/db";
import { runTurn } from "./agent";
import { expireActions, expireMemory } from "./agent-tools";
import { accessFor } from "./access";
import { allowanceFor } from "./allowance";
import { COACH_BY_ID } from "./library";
import { emailOn, sendEmail, siteUrl } from "../lib/email";
import { logger } from "../lib/logger";
import { localDay, localDayStart, localWeekStart } from "../lib/timezone";
import { memberLogs } from "./block";

/**
 * The coach's scheduled work (build plan 2.5), run by POST /api/jobs/coach every hour (.github/workflows/coach.yml):
 * check-ins that are due, and the Sunday weekly review for Coaching members. Each call does a small batch and says
 * whether more is waiting, so one request never runs long. Never throws for one member's failure.
 */
export const CHECKINS_PER_CALL = 20;
export const REVIEWS_PER_CALL = 5;
/** One call stops starting new turns after this long and answers more: true, so a request never outlives curl or
 *  the host's timeout and claimed work is never cut off midway. */
export const CALL_BUDGET_MS = 60_000;
/** The review goes out Sunday evening, after the day's session (member's local time). */
export const REVIEW_FROM_HOUR = 18;
export type JobScope = { userIds?: number[]; deadline?: number };
const timeUp = (scope: JobScope) => scope.deadline !== undefined && Date.now() > scope.deadline;

/** Pure: is it Sunday where this member lives? */
export function isLocalSunday(now: Date, tz: string | null): boolean {
  return (localDay(now, tz) + 4) % 7 === 0; // day 0 (1970-01-01) was a Thursday
}

/** Pure: Sunday, from 18:00 where this member lives. */
export function isReviewTime(now: Date, tz: string | null): boolean {
  return isLocalSunday(now, tz) && now.getTime() - localDayStart(now, tz).getTime() >= REVIEW_FROM_HOUR * 3_600_000;
}

async function emailIfOn(userId: number, subject: string, text: string): Promise<void> {
  const site = siteUrl();
  if (!emailOn() || !site) return;
  const [r] = await db.select({ token: remindersTable.token, email: usersTable.email }).from(remindersTable)
    .innerJoin(usersTable, eq(usersTable.id, remindersTable.userId)).where(eq(remindersTable.userId, userId));
  if (!r) return; // reminders off: the message waits in the app
  await sendEmail(r.email, subject, `${text}\n\nOpen Hypest: ${site}\n\nDon't want these emails? Turn them off: ${site}/reminders/off?token=${r.token}`);
}

async function memberOf(userId: number) {
  const [u] = await db.select({ timezone: usersTable.timezone, coachId: trainingProfilesTable.coachId }).from(usersTable)
    .innerJoin(trainingProfilesTable, eq(trainingProfilesTable.userId, usersTable.id)).where(eq(usersTable.id, userId));
  return u ?? null;
}

/** Check-ins whose time has come. A claimed check-in is never sent twice. */
export async function runDueCheckins(now = new Date(), scope: JobScope = {}): Promise<{ sent: number; cancelled: number; more: boolean }> {
  const due = await db.select({ id: checkinsTable.id, userId: checkinsTable.userId, topic: checkinsTable.topic }).from(checkinsTable)
    .where(and(eq(checkinsTable.status, "pending"), lte(checkinsTable.dueAt, now), scope.userIds ? inArray(checkinsTable.userId, scope.userIds) : undefined))
    .orderBy(asc(checkinsTable.dueAt)).limit(CHECKINS_PER_CALL + 1);
  let sent = 0, cancelled = 0, handled = 0;
  for (const c of due.slice(0, CHECKINS_PER_CALL)) {
    if (timeUp(scope)) break;
    handled += 1;
    try {
      const [claimed] = await db.update(checkinsTable).set({ status: "cancelled" }).where(and(eq(checkinsTable.id, c.id), eq(checkinsTable.status, "pending"))).returning({ id: checkinsTable.id });
      if (!claimed) continue;
      const m = await memberOf(c.userId);
      const access = await accessFor(c.userId);
      if (!m || (await allowanceFor(access.level, "checkin")).perMonth === 0) { cancelled += 1; continue; }
      const turn = await runTurn({
        userId: c.userId, timezone: m.timezone, level: access.level, kind: "checkin", tools: ["write_memory"],
        userText: `Earlier the member asked you to check in with them about: "${c.topic}". Write that check-in now: at most 60 words, in your voice, ending with one simple question.`,
      });
      if (turn.source !== "ai") { cancelled += 1; continue; }
      const [msg] = await db.insert(coachMessagesTable).values({ userId: c.userId, coachId: m.coachId, role: "coach", text: turn.text, source: "checkin" }).returning({ id: coachMessagesTable.id });
      await db.update(checkinsTable).set({ status: "sent", messageId: msg!.id }).where(eq(checkinsTable.id, c.id));
      await emailIfOn(c.userId, `${COACH_BY_ID.get(m.coachId)?.name ?? "Your coach"} checked in`, turn.text);
      sent += 1;
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), checkin: c.id }, "check-in failed");
    }
  }
  return { sent, cancelled, more: due.length > handled };
}

/** The Sunday review for every Coaching member with an active block, once per member per local week. */
export async function runWeeklyReviews(now = new Date(), scope: JobScope = {}): Promise<{ done: number; skipped: number; more: boolean }> {
  const members = await db.selectDistinct({ userId: membershipsTable.userId, timezone: usersTable.timezone })
    .from(membershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
    .innerJoin(plansTable, and(eq(plansTable.userId, membershipsTable.userId), eq(plansTable.status, "active")))
    .where(and(eq(membershipsTable.kind, "tier2"), eq(membershipsTable.status, "active"), or(isNull(membershipsTable.endsAt), gt(membershipsTable.endsAt, now)),
      scope.userIds ? inArray(membershipsTable.userId, scope.userIds) : undefined));
  const sunday = members.filter((m) => isReviewTime(now, m.timezone));
  const weeks = new Map(sunday.map((m) => [m.userId, localWeekStart(now, m.timezone)]));
  const already = sunday.length
    ? await db.select({ userId: weeklyReviewsTable.userId, weekOf: weeklyReviewsTable.weekOf }).from(weeklyReviewsTable).where(inArray(weeklyReviewsTable.userId, sunday.map((m) => m.userId)))
    : [];
  const todo = sunday.filter((m) => !already.some((a) => a.userId === m.userId && a.weekOf === weeks.get(m.userId)));
  let done = 0, skipped = 0, handled = 0;
  for (const m of todo.slice(0, REVIEWS_PER_CALL)) {
    if (timeUp(scope)) break;
    handled += 1;
    const weekOf = weeks.get(m.userId)!;
    try {
      const [claimed] = await db.insert(weeklyReviewsTable).values({ userId: m.userId, weekOf, status: "working" }).onConflictDoNothing().returning({ id: weeklyReviewsTable.id });
      if (!claimed) continue;
      const who = await memberOf(m.userId);
      const access = await accessFor(m.userId);
      if (!who || access.level !== "tier2") {
        await db.update(weeklyReviewsTable).set({ status: "skipped" }).where(eq(weeklyReviewsTable.id, claimed.id));
        skipped += 1;
        continue;
      }
      // No sets logged this week: no load changes, enforced by not offering the tool (not just asked in the prompt).
      const weekLogs = await memberLogs(m.userId, localDayStart(new Date(now.getTime() - 6 * 86_400_000), m.timezone));
      const reviewTools = weekLogs.length ? ["set_target_load", "write_memory", "schedule_checkin"] : ["write_memory", "schedule_checkin"];
      const turn = await runTurn({
        userId: m.userId, timezone: m.timezone, level: access.level, kind: "weekly_review", tools: reviewTools,
        userText: [
          "Weekly review. Look at this week's sessions and the logged sets above.",
          "Where the member hit every target rep on a weighted exercise, you may raise its target with set_target_load (the code caps the jump). Where they missed reps, keep it or lower it a little. Change at most 3 exercises.",
          "If nothing was logged this week, make no changes and send a short, warm 'missed you, here's this week' message.",
          "Save at most one memory if you learned something new.",
          "Then write the member a message about their week and the week ahead: at most 80 words.",
        ].join(" "),
      });
      if (turn.source !== "ai" && turn.changes.length === 0) {
        await db.update(weeklyReviewsTable).set({ status: turn.counted ? "failed" : "skipped" }).where(eq(weeklyReviewsTable.id, claimed.id));
        skipped += 1;
        continue;
      }
      const [msg] = await db.insert(coachMessagesTable).values({ userId: m.userId, coachId: who.coachId, role: "coach", text: turn.text.slice(0, 2000), source: "weekly_review" }).returning({ id: coachMessagesTable.id });
      await db.update(weeklyReviewsTable).set({ status: "done", messageId: msg!.id }).where(eq(weeklyReviewsTable.id, claimed.id));
      await emailIfOn(m.userId, "Your week, from your coach", turn.text);
      done += 1;
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), member: m.userId }, "weekly review failed");
      await db.update(weeklyReviewsTable).set({ status: "failed" }).where(and(eq(weeklyReviewsTable.userId, m.userId), eq(weeklyReviewsTable.weekOf, weekOf))).catch(() => undefined);
    }
  }
  return { done, skipped, more: todo.length > handled };
}

/** One call of the hourly job. */
export async function runCoachJobs(now = new Date()) {
  const scope: JobScope = { deadline: Date.now() + CALL_BUDGET_MS };
  const checkins = await runDueCheckins(now, scope);
  const reviews = await runWeeklyReviews(now, scope);
  const expired = { memory: await expireMemory(now), actions: await expireActions(now) };
  logger.info({ checkins, reviews, expired }, "coach jobs run");
  return { checkins, reviews, expired, more: checkins.more || reviews.more };
}
