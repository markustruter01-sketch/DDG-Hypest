import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { GetCoachChatResponse, SendCoachMessageBody, SendCoachMessageResponse } from "@workspace/api-zod";
import { coachMessagesTable, db, painEventsTable, planSessionsTable, plansTable, trainingProfilesTable, planItemsTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { accessFor, canLog } from "../coaching/access";
import { COACH_BY_ID } from "../coaching/library";
import { chatSystem, DAILY_MESSAGES, HISTORY, screenMessage, STOP_MESSAGE, WELLBEING_MESSAGE, type ChatContext } from "../coaching/chat";
import { aiOn, askClaude } from "../lib/ai";
import { alert } from "../lib/alerts";

const router: IRouter = Router();

/** Start of today in Brisbane (UTC+10, no daylight saving), as a UTC instant. */
function brisbaneDayStart(now = new Date()): Date {
  const shifted = new Date(now.getTime() + 10 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 10 * 3_600_000);
}

async function chatState(userId: number) {
  const access = await accessFor(userId);
  const rows = await db
    .select()
    .from(coachMessagesTable)
    .where(eq(coachMessagesTable.userId, userId))
    .orderBy(desc(coachMessagesTable.id))
    .limit(50);
  const sentToday = rows.filter((r) => r.role === "member" && r.createdAt >= brisbaneDayStart()).length;
  return {
    enabled: aiOn() && canLog(access),
    remaining_today: Math.max(0, DAILY_MESSAGES - sentToday),
    messages: rows.reverse().map((r) => ({ id: r.id, role: r.role as "member" | "coach", text: r.text, created_at: r.createdAt })),
  };
}

async function contextFor(userId: number): Promise<ChatContext | null> {
  const [profile] = await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
  const coach = profile ? COACH_BY_ID.get(profile.coachId) : undefined;
  if (!profile || !coach) return null;
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(and(eq(plansTable.userId, userId), eq(plansTable.status, "active")))
    .orderBy(desc(plansTable.id))
    .limit(1);
  let week: ChatContext["week"] = null;
  if (plan) {
    const sessions = await db.select().from(planSessionsTable).where(eq(planSessionsTable.planId, plan.id)).orderBy(asc(planSessionsTable.week), asc(planSessionsTable.day));
    const current = sessions.find((s) => !s.completedAt)?.week ?? plan.weeks;
    const thisWeek = sessions.filter((s) => s.week === current);
    const items = await Promise.all(thisWeek.map((s) => db.select({ exerciseId: planItemsTable.exerciseId }).from(planItemsTable).where(eq(planItemsTable.sessionId, s.id)).orderBy(asc(planItemsTable.position))));
    week = { block: plan.block, week: current, sessions: thisWeek.map((s, i) => ({ day: s.day, title: s.title, done: Boolean(s.completedAt), exerciseIds: items[i]!.map((x) => x.exerciseId) })) };
  }
  return {
    coach, goal: profile.goal, experience: profile.experience, daysPerWeek: profile.daysPerWeek, minutes: profile.minutes,
    soreAreas: profile.avoidAreas, units: profile.units, week,
  };
}

router.get("/me/coach/messages", requireUser, async (_req, res) => {
  res.json(GetCoachChatResponse.parse(await chatState(authUser(res).id)));
});

router.post("/me/coach/messages", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = SendCoachMessageBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  if (!canLog(await accessFor(user.id))) return void res.status(402).json({ message: "Chat is part of Coaching" });
  if (!aiOn()) return void res.status(503).json({ message: "Chat isn't switched on yet" });
  const state = await chatState(user.id);
  if (state.remaining_today <= 0) return void res.status(429).json({ message: "That's today's messages. Your coach is back tomorrow." });
  const context = await contextFor(user.id);
  if (!context) return void res.status(409).json({ message: "Pick a coach first" });

  const text = body.data.text.trim();
  const screen = screenMessage(text);
  let reply: { text: string; source: "ai" | "safety" };
  if (screen.kind === "stop") {
    // Same rule as "This hurts": stop, see a professional, plan paused. No AI involved.
    const paused = await db
      .update(plansTable)
      .set({ status: "paused", pausedReason: `Safety stop (chat): "${screen.flag}"` })
      .where(and(eq(plansTable.userId, user.id), eq(plansTable.status, "active")))
      .returning({ id: plansTable.id });
    await db.insert(painEventsTable).values({
      userId: user.id, planId: paused.at(0)?.id ?? null, note: text, source: "chat", flag: screen.flag, stopped: true,
    });
    reply = { text: STOP_MESSAGE, source: "safety" };
    void alert("info", `Safety stop: member #${user.id}`, `Coach chat matched "${screen.flag}". Plan paused; member told to see a doctor or physio.`);
  } else if (screen.kind === "wellbeing") {
    reply = { text: WELLBEING_MESSAGE, source: "safety" };
    void alert("warning", `Wellbeing words in coach chat: member #${user.id}`, "The member was shown the fixed help message (emergency numbers). Their text is not in this alert.");
  } else {
    const history = state.messages.slice(-HISTORY).map((m) => ({ role: m.role === "member" ? ("user" as const) : ("assistant" as const), content: m.text }));
    const answer = await askClaude({
      tier: "quick", purpose: "chat", system: chatSystem(context), maxTokens: 300, userId: user.id,
      messages: [...dropLeadingAssistant(history), { role: "user", content: text }],
    });
    if (!answer) return void res.status(503).json({ message: "Your coach can't reply right now. Try again in a minute." });
    reply = { text: answer.slice(0, 1500), source: "ai" };
  }
  await db.insert(coachMessagesTable).values([
    { userId: user.id, coachId: context.coach.id, role: "member", text },
    { userId: user.id, coachId: context.coach.id, role: "coach", text: reply.text, source: reply.source },
  ]);
  res.json(SendCoachMessageResponse.parse(await chatState(user.id)));
});

/** The API expects the conversation to start with the member. */
function dropLeadingAssistant<T extends { role: string }>(messages: T[]): T[] {
  const first = messages.findIndex((m) => m.role === "user");
  return first === -1 ? [] : messages.slice(first);
}

export default router;
