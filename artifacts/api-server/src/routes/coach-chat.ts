import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import {
  DeleteCoachMemoryParams, GetCoachChatResponse, GetCoachMemoryResponse, GetDailyNoteResponse, SendCoachMessageBody,
  SendCoachMessageResponse, UpdateCoachMemoryBody, UpdateCoachMemoryParams, UpdateCoachMemoryResponse,
} from "@workspace/api-zod";
import { coachMemoryTable, coachMessagesTable, db, trainingProfilesTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { accessFor } from "../coaching/access";
import { COACH_BY_ID } from "../coaching/library";
import { HISTORY, MESSAGE_MAX, screenMessage, STOP_MESSAGE, WELLBEING_MESSAGE } from "../coaching/chat";
import { runTurn } from "../coaching/agent";
import { blockIfEatingWords, safetyStop } from "../coaching/safety-stop";
import { CHAT_TOOLS, usage } from "../coaching/allowance";
import { currentBlock } from "../coaching/block";
import { filterReply } from "../coaching/output-filter";
import { mentionsHealth } from "../coaching/health-words";
import { aiOn } from "../lib/ai";
import { alert } from "../lib/alerts";
import { localDayStart } from "../lib/timezone";

/** Coach chat, today's note and the coach's memory (build plan 2.3, 2.4; docs/COACH-AGENT-SPEC.md). */
const router: IRouter = Router();

async function chatState(userId: number, timezone: string | null) {
  const access = await accessFor(userId);
  const u = await usage(userId, access.level, "chat", timezone);
  const rows = await db.select().from(coachMessagesTable).where(eq(coachMessagesTable.userId, userId)).orderBy(desc(coachMessagesTable.id)).limit(50);
  // A "build a new block" button stays live only until a new block exists.
  const block = await currentBlock(userId);
  const since = block?.createdAt ?? new Date(0);
  return {
    enabled: aiOn() && u.perDay > 0,
    remaining_today: Math.max(0, u.perDay - u.usedToday),
    per_day: u.perDay,
    messages: rows.reverse().map((r) => ({
      id: r.id, role: r.role as "member" | "coach", text: r.text, created_at: r.createdAt,
      action: r.action === "build_block" && r.createdAt > since ? ("build_block" as const) : null,
    })),
  };
}

router.get("/me/coach/messages", requireUser, async (_req, res) => {
  const user = authUser(res);
  res.json(GetCoachChatResponse.parse(await chatState(user.id, user.timezone)));
});

router.post("/me/coach/messages", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = SendCoachMessageBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  const [profile] = await db.select({ coachId: trainingProfilesTable.coachId }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, user.id));
  const coach = profile ? COACH_BY_ID.get(profile.coachId) : undefined;
  if (!coach) return void res.status(409).json({ message: "Pick a coach first" });
  const text = body.data.text.trim().slice(0, MESSAGE_MAX);

  // 1. Safety rules on the member's words, BEFORE anything else (spec §6.1): even a member with no allowance left,
  //    or no chat in their tier, who writes "chest pain" gets the stop message and a paused plan. Never counted.
  const screen = screenMessage(text);
  if (screen.kind !== "ok") {
    let reply: string;
    if (screen.kind === "stop") {
      await safetyStop(user.id, text, screen.flag, "chat");
      reply = STOP_MESSAGE;
    } else {
      await blockIfEatingWords(user.id, text, "coach chat");
      reply = WELLBEING_MESSAGE;
      void alert("warning", `Wellbeing words in coach chat: member #${user.id}`, "The member was shown the fixed help message (emergency numbers). Their text is not in this alert.");
    }
    await db.insert(coachMessagesTable).values([
      { userId: user.id, coachId: coach.id, role: "member", text },
      { userId: user.id, coachId: coach.id, role: "coach", text: reply, source: "safety" },
    ]);
    return void res.json(SendCoachMessageResponse.parse(await chatState(user.id, user.timezone)));
  }

  // 2. Is chat part of this member's tier, and is AI on?
  const access = await accessFor(user.id);
  if (CHAT_TOOLS[access.level].length === 0) return void res.status(402).json({ message: "Chat with your coach is part of Plans and Coaching" });
  if (!aiOn()) return void res.status(503).json({ message: "Chat isn't switched on yet" });

  // 3. The agent turn: allowance and budget once, the model with this tier's tools, the output filter.
  const prior = await db.select({ role: coachMessagesTable.role, text: coachMessagesTable.text }).from(coachMessagesTable)
    .where(eq(coachMessagesTable.userId, user.id)).orderBy(desc(coachMessagesTable.id)).limit(HISTORY);
  const history = prior.reverse().map((m) => ({ role: m.role === "member" ? ("user" as const) : ("assistant" as const), content: m.text }));
  const turn = await runTurn({ userId: user.id, timezone: user.timezone, level: access.level, kind: "chat", tools: CHAT_TOOLS[access.level], userText: text, history });
  if (!turn.counted) {
    // Refused before any model call: limit reached (the coach says so in voice), or the budget is spent.
    const status = turn.why === "budget" || turn.why === "ai_off" ? 503 : 429;
    return void res.status(status).json({ message: status === 503 ? "Your coach can't reply right now. Logging and your plan still work." : turn.text });
  }
  await db.insert(coachMessagesTable).values([
    { userId: user.id, coachId: coach.id, role: "member", text },
    { userId: user.id, coachId: coach.id, role: "coach", text: turn.text.slice(0, 2000), source: turn.source === "ai" ? "ai" : "fixed", action: turn.proposal ? "build_block" : null },
  ]);
  res.json(SendCoachMessageResponse.parse(await chatState(user.id, user.timezone)));
});

/**
 * Today's note (step 2.4): written once per local day by the agent, for members whose tier has it. The coach's
 * check-ins and weekly reviews from the last 3 days come with it, so Today can show them.
 */
router.post("/me/coach/daily-note", requireUser, async (_req, res) => {
  const user = authUser(res);
  const dayStart = localDayStart(new Date(), user.timezone);
  const updates = await db.select({ id: coachMessagesTable.id, text: coachMessagesTable.text, source: coachMessagesTable.source, created_at: coachMessagesTable.createdAt })
    .from(coachMessagesTable)
    .where(and(eq(coachMessagesTable.userId, user.id), inArray(coachMessagesTable.source, ["checkin", "weekly_review"]), gte(coachMessagesTable.createdAt, new Date(Date.now() - 3 * 86_400_000))))
    .orderBy(desc(coachMessagesTable.id)).limit(3);
  const reply = (note: string | null) => res.json(GetDailyNoteResponse.parse({ note, updates: updates.map((u) => ({ ...u, source: u.source as "checkin" | "weekly_review" })) }));

  const [today] = await db.select({ text: coachMessagesTable.text }).from(coachMessagesTable)
    .where(and(eq(coachMessagesTable.userId, user.id), eq(coachMessagesTable.source, "daily_note"), gte(coachMessagesTable.createdAt, dayStart)))
    .orderBy(asc(coachMessagesTable.id)).limit(1);
  if (today) return void reply(today.text);
  const access = await accessFor(user.id);
  const [profile] = await db.select({ coachId: trainingProfilesTable.coachId }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, user.id));
  if (!profile || CHAT_TOOLS[access.level].length === 0) return void reply(null);
  const turn = await runTurn({
    userId: user.id, timezone: user.timezone, level: access.level, kind: "daily_note", tools: ["write_memory"],
    userText: "Write today's note for the member's Today screen: one or two short sentences in your voice about today's session (or rest, if nothing is due today). No greeting by name.",
  });
  if (turn.source === "ai") {
    await db.insert(coachMessagesTable).values({ userId: user.id, coachId: profile.coachId, role: "coach", text: turn.text, source: "daily_note" });
    return void reply(turn.text);
  }
  // Already written today by another tab (the allowance is 1 a day), or AI off: the coach's fixed line, not stored.
  const [again] = await db.select({ text: coachMessagesTable.text }).from(coachMessagesTable)
    .where(and(eq(coachMessagesTable.userId, user.id), eq(coachMessagesTable.source, "daily_note"), gte(coachMessagesTable.createdAt, dayStart))).limit(1);
  reply(again?.text ?? (turn.why === "no_coach" ? null : turn.text));
});

// ---------- What your coach remembers (spec §4): the member sees, edits and deletes every item ----------

async function memoryState(userId: number) {
  const rows = await db.select().from(coachMemoryTable).where(eq(coachMemoryTable.userId, userId)).orderBy(desc(coachMemoryTable.updatedAt));
  return { items: rows.map((r) => ({ id: r.id, kind: r.kind as "preference", text: r.text, source: r.source as "agent" | "member", updated_at: r.updatedAt })) };
}

router.get("/me/coach/memory", requireUser, async (_req, res) => {
  res.json(GetCoachMemoryResponse.parse(await memoryState(authUser(res).id)));
});

router.patch("/me/coach/memory/:memoryId", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = UpdateCoachMemoryParams.safeParse(req.params);
  const body = UpdateCoachMemoryBody.strict().safeParse(req.body);
  if (!params.success || !body.success) return void res.status(400).json({ message: "invalid request" });
  const text = body.data.text.trim();
  if (await blockIfEatingWords(user.id, text, "a memory edit")) return void res.status(400).json({ message: WELLBEING_MESSAGE });
  if (mentionsHealth(text)) return void res.status(400).json({ message: "Health details aren't kept here. Your coach remembers training things only." });
  if (filterReply(text, null, 200) !== null) return void res.status(400).json({ message: "That can't be saved here." });
  const updated = await db.update(coachMemoryTable).set({ text, source: "member", updatedAt: new Date() })
    .where(and(eq(coachMemoryTable.id, params.data.memoryId), eq(coachMemoryTable.userId, user.id))).returning({ id: coachMemoryTable.id });
  if (!updated.length) return void res.status(404).json({ message: "not found" });
  res.json(UpdateCoachMemoryResponse.parse(await memoryState(user.id)));
});

router.delete("/me/coach/memory/:memoryId", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = DeleteCoachMemoryParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ message: "invalid request" });
  // Spec §4: deleted at once, not hidden.
  const gone = await db.delete(coachMemoryTable).where(and(eq(coachMemoryTable.id, params.data.memoryId), eq(coachMemoryTable.userId, user.id))).returning({ id: coachMemoryTable.id });
  if (!gone.length) return void res.status(404).json({ message: "not found" });
  res.status(204).end();
});

export default router;
