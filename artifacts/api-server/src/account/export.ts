import { asc, eq, inArray } from "drizzle-orm";
import { coachMessagesTable, db, membershipsTable, painEventsTable, remindersTable, planItemsTable, planSessionsTable, plansTable, setLogsTable, trainingProfilesTable, usersTable } from "@workspace/db";

/** Everything Hypest holds about a member, in plain JSON (their right to a copy of their data). */
export async function exportAccount(userId: number) {
  const [user] = await db
    .select({ email: usersTable.email, display_name: usersTable.displayName, bio: usersTable.bio, handle: usersTable.handle, created_at: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const [profile] = await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
  const plans = await db.select().from(plansTable).where(eq(plansTable.userId, userId)).orderBy(asc(plansTable.block));
  const sessions = plans.length
    ? await db.select().from(planSessionsTable).where(inArray(planSessionsTable.planId, plans.map((p) => p.id))).orderBy(asc(planSessionsTable.week), asc(planSessionsTable.day))
    : [];
  const items = sessions.length
    ? await db.select().from(planItemsTable).where(inArray(planItemsTable.sessionId, sessions.map((s) => s.id))).orderBy(asc(planItemsTable.position))
    : [];
  const logs = items.length
    ? await db.select().from(setLogsTable).where(inArray(setLogsTable.itemId, items.map((i) => i.id))).orderBy(asc(setLogsTable.setNumber))
    : [];
  const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId)).orderBy(asc(membershipsTable.createdAt));
  const pain = await db.select().from(painEventsTable).where(eq(painEventsTable.userId, userId)).orderBy(asc(painEventsTable.id));
  const chat = await db.select().from(coachMessagesTable).where(eq(coachMessagesTable.userId, userId)).orderBy(asc(coachMessagesTable.id));
  const [reminders] = await db.select({ lastSentAt: remindersTable.lastSentAt, createdAt: remindersTable.createdAt }).from(remindersTable).where(eq(remindersTable.userId, userId));

  return {
    exported_at: new Date().toISOString(),
    account: user ?? null,
    reminder_emails: reminders ? { on: true, since: reminders.createdAt, last_sent_at: reminders.lastSentAt } : { on: false },
    training_profile: profile
      ? {
          coach_id: profile.coachId, goal: profile.goal, experience: profile.experience, days_per_week: profile.daysPerWeek,
          minutes: profile.minutes, equipment: profile.equipment, avoid_areas: profile.avoidAreas, units: profile.units,
          health_accepted_at: profile.healthAcceptedAt, health_check: profile.screening, updated_at: profile.updatedAt,
        }
      : null,
    plans: plans.map((p) => ({
      block: p.block, coach_id: p.coachId, weeks: p.weeks, status: p.status, paused_reason: p.pausedReason, created_at: p.createdAt,
      sessions: sessions.filter((s) => s.planId === p.id).map((s) => ({
        week: s.week, day: s.day, title: s.title, completed_at: s.completedAt,
        items: items.filter((i) => i.sessionId === s.id).map((i) => ({
          exercise_id: i.exerciseId, sets: i.sets, reps: i.reps, seconds: i.seconds, rest_seconds: i.restSeconds,
          target_load_kg: i.targetLoadKg, swapped_from: i.swappedFrom,
          logs: logs.filter((l) => l.itemId === i.id).map((l) => ({ set_number: l.setNumber, exercise_id: l.exerciseId, reps: l.reps, seconds: l.seconds, load_kg: l.loadKg, at: l.createdAt })),
        })),
      })),
    })),
    memberships: memberships.map((m) => ({ kind: m.kind, status: m.status, test: m.test, starts_at: m.startsAt, ends_at: m.endsAt, used_at: m.usedAt })),
    pain_reports: pain.map((p) => ({
      source: p.source, exercise_id: p.exerciseId, area: p.area, note: p.note, warning_word: p.flag, paused_plan: p.stopped,
      at: p.createdAt, resolved_at: p.resolvedAt, resolved_note: p.resolvedNote,
    })),
    coach_chat: chat.map((c) => ({ coach_id: c.coachId, role: c.role, text: c.text, at: c.createdAt })),
  };
}
