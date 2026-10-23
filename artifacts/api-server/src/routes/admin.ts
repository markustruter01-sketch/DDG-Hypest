import { Router, type IRouter, type RequestHandler } from "express";
import { and, count, desc, eq, gte, isNotNull, sum } from "drizzle-orm";
import { GetAdminSummaryResponse } from "@workspace/api-zod";
import {
  aiUsageTable, billingEventsTable, coachMessagesTable, db, membershipsTable, planSessionsTable, plansTable, setLogsTable, usersTable,
} from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { paymentsMode } from "../lib/stripe";
import { aiBudgetUsd, aiOn } from "../lib/ai";
import { emailOn, siteUrl } from "../lib/email";

/**
 * Owner's view. ADMIN_EMAILS (Replit Secrets, comma-separated) lists who may see it; everyone else gets
 * 404, so the page's existence isn't revealed. Read-only: counts and statuses, no member emails or messages.
 */
const router: IRouter = Router();

const admins = () => (process.env["ADMIN_EMAILS"] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const requireAdmin: RequestHandler = (_req, res, next) => {
  if (!admins().includes(authUser(res).email.toLowerCase())) return void res.status(404).json({ message: "not found" });
  next();
};

const num = (v: unknown) => Number(v ?? 0);

router.get("/admin/summary", requireUser, requireAdmin, async (_req, res) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [[total], [fresh], memberships, [plans], [sessions], [sets], [chat], [ai], [aiFailed], paused, events] = await Promise.all([
    db.select({ n: count() }).from(usersTable),
    db.select({ n: count() }).from(usersTable).where(gte(usersTable.createdAt, weekAgo)),
    db.select({ kind: membershipsTable.kind, test: membershipsTable.test, n: count() }).from(membershipsTable).where(eq(membershipsTable.status, "active")).groupBy(membershipsTable.kind, membershipsTable.test),
    db.select({ n: count() }).from(plansTable).where(gte(plansTable.createdAt, weekAgo)),
    db.select({ n: count() }).from(planSessionsTable).where(and(isNotNull(planSessionsTable.completedAt), gte(planSessionsTable.completedAt, weekAgo))),
    db.select({ n: count() }).from(setLogsTable).where(gte(setLogsTable.createdAt, weekAgo)),
    db.select({ n: count() }).from(coachMessagesTable).where(and(eq(coachMessagesTable.role, "member"), gte(coachMessagesTable.createdAt, weekAgo))),
    db.select({ n: count(), cost: sum(aiUsageTable.costMicroUsd) }).from(aiUsageTable).where(gte(aiUsageTable.at, monthStart)),
    db.select({ n: count() }).from(aiUsageTable).where(and(gte(aiUsageTable.at, monthStart), eq(aiUsageTable.ok, false))),
    db.select({ plan_id: plansTable.id, member_id: plansTable.userId, reason: plansTable.pausedReason }).from(plansTable).where(eq(plansTable.status, "paused")).orderBy(desc(plansTable.id)).limit(20),
    db.select({ id: billingEventsTable.id, type: billingEventsTable.type, outcome: billingEventsTable.outcome, livemode: billingEventsTable.livemode, received_at: billingEventsTable.receivedAt }).from(billingEventsTable).orderBy(desc(billingEventsTable.receivedAt)).limit(20),
  ]);

  const kinds = ["intro_plan", "plan", "tier1", "tier2"];
  res.json(GetAdminSummaryResponse.parse({
    generated_at: now,
    switches: { payments: paymentsMode(), ai: aiOn(), email: emailOn() && siteUrl() !== null, alerts: Boolean((process.env["DISCORD_WEBHOOK_URL"] ?? "").trim()) },
    members: { total: num(total?.n), new_7d: num(fresh?.n) },
    memberships: kinds.map((kind) => ({
      kind,
      live: num(memberships.find((m) => m.kind === kind && !m.test)?.n),
      test: num(memberships.find((m) => m.kind === kind && m.test)?.n),
    })),
    activity_7d: { plans_built: num(plans?.n), sessions_done: num(sessions?.n), sets_logged: num(sets?.n), chat_messages: num(chat?.n) },
    ai: { month_spend_usd: num(ai?.cost) / 1e6, budget_usd: aiBudgetUsd(), calls_month: num(ai?.n), failed_month: num(aiFailed?.n) },
    paused_plans: paused,
    billing_events: events,
  }));
});

export default router;
