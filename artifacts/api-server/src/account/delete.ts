import { and, eq, inArray, like } from "drizzle-orm";
import {
  agentActionsTable,
  aiLedgerDailyTable,
  bodyMetricsTable,
  eventsTable,
  mealLogsTable,
  mealPlansTable,
  midweekChecksTable,
  monthlyReportsTable,
  morningCheckinsTable,
  nutritionProfilesTable,
  nutritionTargetsTable,
  aiLedgerMonthlyTable,
  checkinsTable,
  coachMemoryTable,
  weeklyReviewsTable,
  authFailuresTable,
  coachMessagesTable,
  db,
  passwordResetsTable,
  remindersTable,
  membershipsTable,
  painEventsTable,
  planItemsTable,
  planSessionsTable,
  plansTable,
  programsTable,
  purchasesTable,
  sessionsTable,
  setLogsTable,
  trainingProfilesTable,
  usersTable,
} from "@workspace/db";

export type CancelSubscription = (subscriptionId: string) => Promise<void>;

/** Live Stripe subscriptions this person still pays for. */
export async function activeSubscriptionIds(userId: number): Promise<string[]> {
  const rows = await db
    .select({ ref: membershipsTable.stripeRef })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.status, "active"), like(membershipsTable.stripeRef, "sub_%")));
  return rows.map((r) => r.ref).filter((r): r is string => r !== null);
}

/**
 * Deletes a member's account. Order matters: subscriptions are cancelled at Stripe FIRST, so nobody is
 * charged for an account that no longer exists; if that fails, nothing is deleted.
 * Deleted: training answers, plans, sessions, set logs, pain reports, coach chat, the coach's memory, agent actions,
 * check-ins, weekly reviews, AI ledgers, nutrition set-up and targets, meal plans and logs, body metrics, morning
 * check-ins, Pro reports, logins, reset links, reminder settings, failed-login records, test purchases.
 * Kept, with no personal details: membership and payment records (kind, dates, Stripe ids), because
 * payments must stay traceable. Product events stay for the counts, with the member's id removed. The account row stays as "Deleted member" so those records still point somewhere.
 */
export async function deleteAccount(userId: number, cancel: CancelSubscription | null): Promise<void> {
  const subscriptions = await activeSubscriptionIds(userId);
  if (subscriptions.length && !cancel) throw new Error("payments are off, so the membership can't be cancelled");
  for (const id of subscriptions) await cancel!(id);

  await db.transaction(async (tx) => {
    await tx.delete(painEventsTable).where(eq(painEventsTable.userId, userId));
    const plans = await tx.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.userId, userId));
    const planIds = plans.map((p) => p.id);
    if (planIds.length) {
      const sessions = await tx.select({ id: planSessionsTable.id }).from(planSessionsTable).where(inArray(planSessionsTable.planId, planIds));
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length) {
        const items = await tx.select({ id: planItemsTable.id }).from(planItemsTable).where(inArray(planItemsTable.sessionId, sessionIds));
        const itemIds = items.map((i) => i.id);
        if (itemIds.length) await tx.delete(setLogsTable).where(inArray(setLogsTable.itemId, itemIds));
        await tx.delete(planItemsTable).where(inArray(planItemsTable.sessionId, sessionIds));
        await tx.delete(planSessionsTable).where(inArray(planSessionsTable.id, sessionIds));
      }
      await tx.delete(plansTable).where(inArray(plansTable.id, planIds));
    }
    await tx.delete(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
    await tx.delete(purchasesTable).where(and(eq(purchasesTable.buyerId, userId), eq(purchasesTable.status, "test")));
    await tx.update(programsTable).set({ status: "draft" }).where(eq(programsTable.creatorId, userId));
    await tx
      .update(membershipsTable)
      .set({ status: "ended", endsAt: new Date() })
      .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.status, "active")));
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
    await tx.delete(coachMessagesTable).where(eq(coachMessagesTable.userId, userId));
    await tx.delete(coachMemoryTable).where(eq(coachMemoryTable.userId, userId));
    await tx.delete(agentActionsTable).where(eq(agentActionsTable.userId, userId));
    await tx.delete(checkinsTable).where(eq(checkinsTable.userId, userId));
    await tx.delete(weeklyReviewsTable).where(eq(weeklyReviewsTable.userId, userId));
    await tx.delete(aiLedgerDailyTable).where(eq(aiLedgerDailyTable.userId, userId));
    await tx.delete(aiLedgerMonthlyTable).where(eq(aiLedgerMonthlyTable.userId, userId));
    await tx.delete(nutritionProfilesTable).where(eq(nutritionProfilesTable.userId, userId));
    await tx.delete(nutritionTargetsTable).where(eq(nutritionTargetsTable.userId, userId));
    await tx.delete(mealPlansTable).where(eq(mealPlansTable.userId, userId));
    await tx.delete(mealLogsTable).where(eq(mealLogsTable.userId, userId));
    await tx.delete(bodyMetricsTable).where(eq(bodyMetricsTable.userId, userId));
    await tx.delete(morningCheckinsTable).where(eq(morningCheckinsTable.userId, userId));
    await tx.delete(monthlyReportsTable).where(eq(monthlyReportsTable.userId, userId));
    await tx.delete(midweekChecksTable).where(eq(midweekChecksTable.userId, userId));
    await tx.update(eventsTable).set({ userId: null }).where(eq(eventsTable.userId, userId));
    await tx.delete(passwordResetsTable).where(eq(passwordResetsTable.userId, userId));
    await tx.delete(remindersTable).where(eq(remindersTable.userId, userId));
    const [who] = await tx.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (who) await tx.delete(authFailuresTable).where(eq(authFailuresTable.email, who.email));
    await tx
      .update(usersTable)
      .set({
        email: `deleted-${userId}@deleted.invalid`,
        displayName: "Deleted member",
        bio: null,
        handle: null,
        passwordHash: "deleted",
        referredByCreatorId: null,
        referredAt: null,
      })
      .where(eq(usersTable.id, userId));
  });
}
