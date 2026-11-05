import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { agentActionsTable, db, nutritionTargetsTable, painEventsTable, trainingProfilesTable, usersTable } from "@workspace/db";
import { callModel, costMicroUsd, globalBudgetAllows, aiOn, type ApiMessage, type ContentBlock, type Kind, type Message, type TextBlock, type Tier, type ToolUseBlock } from "../lib/ai";
import { COACH_BY_ID, EXERCISE_BY_ID, type Coach } from "./library";
import { currentBlock, currentWeek, lifetimeSummary, memberLogs, planNumbers, type Block } from "./block";
import { filterReply, REPLY_MAX } from "./output-filter";
import { memoryOf, runTool, TOOL_DEFS, type Change, type ToolName } from "./agent-tools";
import { reserveTurn, settleTurn } from "./allowance";
import type { Level } from "./access";
import { BASE_RULES, PROMPT_VERSION, promptFor, type CoachPrompt } from "./prompts";
import { localDay } from "../lib/timezone";
import { todayCheckin } from "./body";
import { lowDayReason } from "./readiness";

/**
 * The coach agent (docs/COACH-AGENT-SPEC.md). One member action = one turn: rules have already screened the member's
 * text (the caller does that, before anything else); here: allowance and budget (once per turn) → model with tools
 * (at most 3 tool steps) → output filter → the reply. Never throws for the member: every failure ends in a fixed line.
 */
export const MAX_TOOL_STEPS = 3;
/** Model calls per turn: 3 tool rounds and the answer (spec §3). */
export const MAX_MODEL_CALLS = MAX_TOOL_STEPS + 1;

export type TurnKind = Extract<Kind, "chat" | "daily_note" | "checkin" | "weekly_review" | "midweek_check" | "monthly_report">;

/** planNumbers: false = the reply may quote past lifts (the monthly report); every other filter rule still applies. */
type KindSpec = { tier: Tier; maxTokens: number; maxChars: number; planNumbers?: false };
export const KIND_SPECS: Record<TurnKind, KindSpec> = {
  chat: { tier: "quick", maxTokens: 300, maxChars: REPLY_MAX },
  daily_note: { tier: "quick", maxTokens: 200, maxChars: 300 },
  checkin: { tier: "quick", maxTokens: 250, maxChars: 400 },
  weekly_review: { tier: "plan", maxTokens: 800, maxChars: REPLY_MAX },
  midweek_check: { tier: "plan", maxTokens: 800, maxChars: REPLY_MAX },
  monthly_report: { tier: "plan", maxTokens: 700, maxChars: 1800, planNumbers: false },
};

export type TurnOutcome = {
  /** What the member sees. Always set. */
  text: string;
  /** ai = the model's reply passed the filter; fixed = a fixed coach line (limit, fallback, AI off). */
  source: "ai" | "fixed";
  /** Why a fixed line was used, when it was. */
  why: null | "none" | "day" | "month" | "cap" | "budget" | "ai_off" | "no_coach" | "model_failed" | "tool_failed" | `filter:${string}`;
  /** The member can tap to build a new block (spec §3 build_block). */
  proposal: boolean;
  changes: Change[];
  /** Whether a turn was reserved (counts against the allowance). */
  counted: boolean;
};

/** Pure: the worst-case cost of one turn, reserved up front (spec §7): every call retried once, every output token used. */
export function turnEstimateMicro(tier: Tier, promptChars: number, maxTokens: number): number {
  const inputTokens = Math.ceil(promptChars / 3) + 2_000; // tool schemas and tool results on top of the prompt
  // Priced as cache writes (1.25×), the dearest case, so settling the real cost never lands above the reservation.
  return MAX_MODEL_CALLS * 2 * costMicroUsd(tier, 0, maxTokens, inputTokens, 0);
}

type Ctx = { coach: Coach; prompt: CoachPrompt; block: Block | null; system: TextBlock[]; lowDay: boolean };

const fmtItem = (i: Block["sessions"][number]["items"][number]) => {
  const ex = EXERCISE_BY_ID.get(i.exerciseId);
  const dose = i.reps !== null ? `${i.sets}x${i.reps}` : `${i.sets}x${i.seconds}s`;
  return `item ${i.id}: ${ex?.name ?? i.exerciseId} (${i.exerciseId}), ${dose}${i.targetLoadKg !== null ? ` @ ${i.targetLoadKg} kg` : ""}, rest ${i.restSeconds}s${i.logged ? ", logged" : ""}`;
};

/** Spec §8: the standing context. Part one is cached; part two changes each turn. No names or emails are sent. */
export async function buildContext(userId: number, timezone: string | null, level: Level, tools: string[], now = new Date()): Promise<Ctx | null> {
  const [profile] = await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
  const coach = profile ? COACH_BY_ID.get(profile.coachId) : undefined;
  if (!profile || !coach) return null;
  const prompt = promptFor(coach.id);
  const memory = await memoryOf(userId);
  const pain = await db.select({ area: painEventsTable.area, exerciseId: painEventsTable.exerciseId, stopped: painEventsTable.stopped, at: painEventsTable.createdAt })
    .from(painEventsTable)
    .where(and(eq(painEventsTable.userId, userId), or(and(eq(painEventsTable.stopped, true), isNull(painEventsTable.resolvedAt)), gt(painEventsTable.createdAt, new Date(now.getTime() - 14 * 86_400_000)))))
    .orderBy(desc(painEventsTable.createdAt)).limit(10);
  const block = await currentBlock(userId);
  const lifetime = await lifetimeSummary(userId, now);
  const blocksDone = block ? block.block - 1 : 0;
  const months = (d: Date | string | null) => (d ? Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / (30 * 86_400_000))) : 0);

  const can = tools.length ? `Tools you may use for this member: ${tools.join(", ")}.` : "You have no tools for this member.";
  const cannot = level === "tier1" ? " This member is on Starter: swapping exercises and changing loads are part of Coaching; say so if they ask." : "";
  const part1 = [
    BASE_RULES,
    `You are ${coach.name}. Discipline: ${coach.title}. Voice: ${prompt.voice}`,
    `Examples of your replies:\n${prompt.examples.map((e) => `- ${e}`).join("\n")}`,
    can + cannot,
    `Member: goal ${profile.goal}, experience ${profile.experience}, ${profile.daysPerWeek} days a week, ${profile.minutes} minutes a session, equipment: ${profile.equipment.join(", ") || "none"}, areas to keep load off: ${profile.avoidAreas.join(", ") || "none"}. Weights shown in ${profile.units}. Membership: ${level}.`,
    memory.length ? `What you remember (newest first, id: text):\n${memory.map((m) => `${m.id} [${m.kind}]: ${m.text}`).join("\n")}` : "You don't remember anything about this member yet.",
    lifetime.length
      ? `Training history (all time, one line per main exercise; ${blocksDone} blocks finished): ${lifetime.map((l) => `${EXERCISE_BY_ID.get(l.exerciseId)?.name ?? l.exerciseId}: ${l.sets} sets over ${months(l.first)} months${l.firstKg !== null ? `, started ${l.firstKg} kg` : ""}${l.bestKg !== null ? `, best ${l.bestKg} kg` : ""}${l.bestRecentKg !== null && l.bestRecentKg !== l.bestKg ? `, best in the last 3 months ${l.bestRecentKg} kg` : ""}`).join("; ")}.`
      : `Training history: nothing logged yet; ${blocksDone} blocks finished.`,
    pain.length ? `Pain reports: ${pain.map((p) => `${p.stopped ? "SAFETY STOP" : "this hurts"}${p.area ? ` (${p.area})` : ""}${p.exerciseId ? ` on ${EXERCISE_BY_ID.get(p.exerciseId)?.name ?? p.exerciseId}` : ""}`).join("; ")}.` : "No recent pain reports.",
  ].join("\n\n");

  // Spec 3.1 §11: the food targets as two numbers. The chat filter still drops any reply that quotes them in kcal.
  const [who] = await db.select({ blocked: usersTable.nutritionBlocked }).from(usersTable).where(eq(usersTable.id, userId));
  const [food] = who?.blocked ? [] : await db.select({ kcal: nutritionTargetsTable.kcal, protein: nutritionTargetsTable.proteinG }).from(nutritionTargetsTable).where(eq(nutritionTargetsTable.userId, userId));
  // Spec 3.1 §7: today's morning check-in and the readiness result. The rule is code; the coach can't change it.
  const checkin = await todayCheckin(userId, timezone, now);
  const low = level === "tier2" || level === "tier3" ? lowDayReason(checkin) : null;
  const checkinLine = checkin
    ? `Morning check-in today: sleep ${checkin.sleepHalfHours / 2} h, energy ${checkin.energy}/5, soreness ${checkin.soreness}/5. ${low ? "LOW DAY: sessions not started today are shown lighter (one fewer set, lighter targets); the stored plan is unchanged." : "Not a low day."}`
    : "No morning check-in today.";
  const foodLine = who?.blocked
    ? "Food: switched off for this member. If they ask about eating, say only: \"For eating advice, please see a doctor or dietitian.\""
    : food ? `Food targets (Food screen): about ${food.kcal} a day, ${food.protein} protein. Never write these numbers or units in a reply: say "your target on the Food screen".` : "Food: not set up.";

  let part2: string;
  if (!block) {
    part2 = `The member has no plan yet.\n${checkinLine}\n${foodLine}`;
  } else {
    const week = currentWeek(block);
    const thisWeek = block.sessions.filter((s) => s.week === week);
    const logs = await memberLogs(userId, new Date(now.getTime() - 14 * 86_400_000));
    const byEx = new Map<string, { sets: number; best: number | null; last: string }>();
    for (const l of logs) {
      const e = byEx.get(l.exerciseId) ?? { sets: 0, best: null, last: `${l.reps ?? l.seconds ?? "?"}${l.reps !== null ? " reps" : "s"}${l.loadKg !== null ? ` at ${l.loadKg} kg` : ""}` };
      e.sets += 1;
      if (l.loadKg !== null && (e.best === null || l.loadKg > e.best)) e.best = l.loadKg;
      byEx.set(l.exerciseId, e);
    }
    part2 = [
      `Today is ${new Date(localDay(now, timezone) * 86_400_000).toISOString().slice(0, 10)} (member's local date).`,
      `Plan: block ${block.block}, ${block.status === "paused" ? `PAUSED for safety (${block.pausedReason ?? "safety stop"}): no changes until the member resumes it from the plan screen` : "active"}. Current week ${week} of ${Math.max(...block.sessions.map((s) => s.week))}.`,
      ...thisWeek.map((s) => `Week ${s.week} day ${s.day} "${s.title}" (${s.done ? "done" : "to do"}):\n${s.items.map((i) => `  ${fmtItem(i)}`).join("\n")}`),
      checkinLine,
      foodLine,
      byEx.size ? `Logged in the last 14 days (exercise: sets logged, best load, last set):\n${[...byEx].map(([id, e]) => `${EXERCISE_BY_ID.get(id)?.name ?? id} (${id}): ${e.sets} sets${e.best !== null ? `, best ${e.best} kg` : ""}, last ${e.last}`).join("\n")}` : "Nothing logged in the last 14 days.",
    ].join("\n");
  }
  return {
    coach, prompt, block, lowDay: low !== null,
    system: [
      { type: "text", text: part1, cache_control: { type: "ephemeral" } },
      { type: "text", text: part2 },
    ],
  };
}

const textOf = (blocks: ContentBlock[]) => blocks.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("").trim();

/** One agent turn. `userText` is the member's message (chat) or the job's instruction (note, check-in, review). */
export async function runTurn(args: {
  userId: number;
  timezone: string | null;
  level: Level;
  kind: TurnKind;
  tools: string[];
  userText: string;
  history?: Message[];
}): Promise<TurnOutcome> {
  const spec = KIND_SPECS[args.kind];
  const fixed = (text: string, why: TurnOutcome["why"], counted = false, changes: Change[] = [], proposal = false): TurnOutcome =>
    ({ text: changes.length ? [text, ...changes.map((c) => c.line)].join(" ") : text, source: "fixed", why, proposal, changes, counted });
  const ctx = await buildContext(args.userId, args.timezone, args.level, args.tools);
  if (!ctx) return fixed("Pick a coach first.", "no_coach");
  if (!aiOn()) return fixed(args.kind === "chat" ? ctx.prompt.lines.limit : ctx.prompt.lines.dailyNoteOff, "ai_off");

  const history = dropLeadingAssistant(args.history ?? []);
  const promptChars = ctx.system.reduce((n, b) => n + b.text.length, 0) + history.reduce((n, m) => n + m.content.length, 0) + args.userText.length;
  const est = turnEstimateMicro(spec.tier, promptChars, spec.maxTokens);
  // Global budget once per turn, BEFORE the member's allowance is touched, so a refusal costs them nothing.
  if (!(await globalBudgetAllows(est))) return fixed(args.kind === "chat" ? ctx.prompt.lines.limit : ctx.prompt.lines.dailyNoteOff, "budget");
  const reservation = await reserveTurn(args.userId, args.level, args.kind, est, args.timezone);
  if (!reservation.ok) {
    const line = reservation.why === "none" && args.kind === "chat" ? ctx.prompt.lines.upgrade : args.kind === "chat" ? ctx.prompt.lines.limit : ctx.prompt.lines.dailyNoteOff;
    return fixed(line, reservation.why);
  }

  const turnId = randomUUID();
  const changes: Change[] = [];
  let block = ctx.block;
  const toolCtx = {
    userId: args.userId, timezone: args.timezone, turnId, block,
    reload: async () => { block = await currentBlock(args.userId); toolCtx.block = block; return block; },
  };
  const tools = args.tools.filter((t): t is ToolName => t in TOOL_DEFS).map((t) => TOOL_DEFS[t]);
  const messages: ApiMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    // Cache breakpoint 2 (spec §8): the tool rounds inside this turn reuse everything up to here.
    { role: "user", content: [{ type: "text", text: args.userText, cache_control: { type: "ephemeral" } }] },
  ];
  let steps = 0;
  let spent = 0;
  let lastText = "";
  let proposal = false;
  let failed: TurnOutcome["why"] = null;

  try {
    for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
      const reply = await callModel({ tier: spec.tier, kind: args.kind, system: ctx.system, messages, tools, maxTokens: spec.maxTokens, userId: args.userId, promptVersion: PROMPT_VERSION });
      if (!reply.ok) { failed = "model_failed"; break; }
      spent += reply.costMicro;
      const text = textOf(reply.content);
      if (text) lastText = text;
      const uses = reply.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      if (!uses.length || steps >= MAX_TOOL_STEPS) break; // answered, or asked for a 4th tool: stop (spec §3)
      const results: ContentBlock[] = [];
      for (const use of uses) {
        if (steps >= MAX_TOOL_STEPS || !args.tools.includes(use.name)) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ ok: false, reason: steps >= MAX_TOOL_STEPS ? "tool limit for this message reached" : "that tool isn't available for this member" }), is_error: true });
          continue;
        }
        steps += 1;
        const result = await runTool(use.name, use.input, toolCtx, changes);
        if (result.ok && use.name === "build_block") proposal = true;
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result), ...(result.ok ? {} : { is_error: true }) });
      }
      messages.push({ role: "assistant", content: reply.content });
      messages.push({ role: "user", content: results });
      lastText = ""; // the answer must come after the tool results
    }
  } catch {
    failed = "tool_failed";
  } finally {
    await settleTurn(args.userId, reservation, spent).catch(() => undefined);
  }

  if (proposal) changes.push({ tool: "build_block", line: "Tap the button below to start your new block." });
  if (failed) return fixed(ctx.prompt.lines.fallback, failed, true, changes, proposal);
  const rule = filterReply(lastText, planNumbers(block, ctx.lowDay), spec.maxChars, { skipPlanNumbers: spec.planNumbers === false });
  if (rule !== null) {
    await db.insert(agentActionsTable).values({ userId: args.userId, turnId, tool: "filter_drop", touched: {}, result: { ok: false, rule }, promptVersion: PROMPT_VERSION });
    return fixed(ctx.prompt.lines.fallback, `filter:${rule}`, true, changes, proposal);
  }
  return { text: lastText, source: "ai", why: null, proposal, changes, counted: true };
}

/** The API expects the conversation to start with the member. */
function dropLeadingAssistant<T extends { role: string }>(messages: T[]): T[] {
  const first = messages.findIndex((m) => m.role === "user");
  return first === -1 ? [] : messages.slice(first);
}
