import { z } from "zod";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { agentActionsTable, checkinsTable, coachMemoryTable, coachMessagesTable, db, planItemsTable } from "@workspace/db";
import type { ToolDef } from "../lib/ai";
import { COACH_BY_ID, EXERCISE_BY_ID, type Area, type Equipment } from "./library";
import { findSwap, nextLoads, validatePlan } from "./engine";
import { asPlan, memberLogs, planNumbers, type Block } from "./block";
import { filterReply } from "./output-filter";
import { mentionsHealth } from "./health-words";
import { accessFor, canAutoNext } from "./access";
import { localDayStart } from "../lib/timezone";
import { PROMPT_VERSION } from "./prompts";

/**
 * The agent's five tools (docs/COACH-AGENT-SPEC.md §3). The model only ASKS; the limits below are enforced here,
 * in code. A refusal changes nothing. Every call is logged in agent_actions with ids and the result, never text.
 */
export const MAX_SWAPS_PER_BLOCK = 3;
export const MAX_MEMORY = 40;
export const MAX_PENDING_CHECKINS = 2;
const LB_PER_KG = 2.2046226218;

export type ToolContext = {
  userId: number;
  timezone: string | null;
  turnId: string;
  /** The member's block when the turn started; tools re-read it before changing anything. */
  block: Block | null;
  /** Re-read the block (after a change). */
  reload: () => Promise<Block | null>;
};

export type ToolResult = { ok: true; [k: string]: unknown } | { ok: false; reason: string };
/** A plain-English line for each change, so a change is never invisible (spec §6.5). */
export type Change = { tool: string; line: string };

const AREAS = ["knee", "lower_back", "shoulder", "wrist", "hip", "ankle", "neck"] as const;
const EQUIPMENT = ["dumbbells", "kettlebell", "barbell", "machines", "bands", "pullup_bar", "cardio_machine", "pool"] as const;
const MEMORY_KINDS = ["preference", "schedule", "equipment", "goal_detail", "motivation"] as const;
const reason = z.string().trim().min(1).max(140);

const Inputs = {
  build_block: z.object({ reason }).strict(),
  swap_exercise: z.object({ item_id: z.number().int(), missing_equipment: z.array(z.enum(EQUIPMENT)).max(8).optional(), avoid_area: z.enum(AREAS).optional(), reason }).strict(),
  set_target_load: z.object({ exercise_id: z.string().min(1).max(60), load: z.number().min(0).max(1000), units: z.enum(["kg", "lb"]), reason }).strict(),
  write_memory: z.object({ kind: z.enum(MEMORY_KINDS), text: z.string().trim().min(1).max(200), replaces_id: z.number().int().optional() }).strict(),
  schedule_checkin: z.object({ in_days: z.number().int().min(1).max(14), topic: z.string().trim().min(1).max(100) }).strict(),
};
export type ToolName = keyof typeof Inputs;
export const TOOL_NAMES = Object.keys(Inputs) as ToolName[];

/** What the model sees: name, one line, JSON schema. */
export const TOOL_DEFS: Record<ToolName, ToolDef> = {
  build_block: {
    name: "build_block",
    description: "Offer the member a button to start a new 4-week block (it does not build it). Use when they ask for a new block or their schedule changed.",
    input_schema: { type: "object", properties: { reason: { type: "string", maxLength: 140 } }, required: ["reason"], additionalProperties: false },
  },
  swap_exercise: {
    name: "swap_exercise",
    description: "Swap an exercise for the rest of this block (every not-yet-done session). Give the item_id from the plan, and what is missing or must be avoided.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "integer" },
        missing_equipment: { type: "array", items: { type: "string", enum: [...EQUIPMENT] } },
        avoid_area: { type: "string", enum: [...AREAS] },
        reason: { type: "string", maxLength: 140, description: "One short line shown to the member under the exercise." },
      },
      required: ["item_id", "reason"], additionalProperties: false,
    },
  },
  set_target_load: {
    name: "set_target_load",
    description: "Set the target load for one exercise for the rest of this block. Only for exercises the member has logged. Code caps it at 10% above their recent work.",
    input_schema: {
      type: "object",
      properties: {
        exercise_id: { type: "string" }, load: { type: "number" }, units: { type: "string", enum: ["kg", "lb"] },
        reason: { type: "string", maxLength: 140, description: "One short line shown to the member under the exercise." },
      },
      required: ["exercise_id", "load", "units", "reason"], additionalProperties: false,
    },
  },
  write_memory: {
    name: "write_memory",
    description: "Remember one training fact about the member (preference, schedule, equipment, goal detail, motivation). Never health details. Use replaces_id to update an item.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string", enum: [...MEMORY_KINDS] }, text: { type: "string", maxLength: 200 }, replaces_id: { type: "integer" } },
      required: ["kind", "text"], additionalProperties: false,
    },
  },
  schedule_checkin: {
    name: "schedule_checkin",
    description: "Send the member a short message in 1 to 14 days, when they ask you to check in.",
    input_schema: {
      type: "object",
      properties: { in_days: { type: "integer", minimum: 1, maximum: 14 }, topic: { type: "string", maxLength: 100 } },
      required: ["in_days", "topic"], additionalProperties: false,
    },
  },
};

const refuse = (reason: string): ToolResult => ({ ok: false, reason });
const nameOf = (id: string) => EXERCISE_BY_ID.get(id)?.name ?? id;
const roundDownHalf = (kg: number) => Math.floor(kg * 2 + 1e-9) / 2;
const shown = (text: string, b: Block | null, max: number, fallback: string) => (filterReply(text, planNumbers(b), max) === null ? text.trim() : fallback);

/** Runs one tool. Never throws for a refusal; throws only on a real error (the turn then ends with the fallback). */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext, changes: Change[]): Promise<ToolResult> {
  if (!(name in Inputs)) return refuse("unknown tool");
  const parsed = Inputs[name as ToolName].safeParse(rawInput);
  let result: ToolResult;
  let touched: Record<string, unknown> = {};
  if (!parsed.success) {
    result = refuse(`bad input: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  } else {
    const out = await TOOLS[name as ToolName](parsed.data as never, ctx, changes);
    result = out.result;
    touched = out.touched;
  }
  await db.insert(agentActionsTable).values({
    userId: ctx.userId, turnId: ctx.turnId, tool: name, touched,
    result: result.ok ? { ok: true } : { ok: false, reason: result.reason }, promptVersion: PROMPT_VERSION,
  });
  return result;
}

type Out = { result: ToolResult; touched: Record<string, unknown> };
type Impl<N extends ToolName> = (input: z.infer<(typeof Inputs)[N]>, ctx: ToolContext, changes: Change[]) => Promise<Out>;

/** Every tool except write_memory needs an active block (spec §3). */
async function activeBlock(ctx: ToolContext): Promise<Block | string> {
  const b = await ctx.reload();
  if (!b) return "the member has no plan";
  if (b.status !== "active") return "the plan is paused for safety; the member must resume it first";
  return b;
}

const buildBlock: Impl<"build_block"> = async (_input, ctx) => {
  const access = await accessFor(ctx.userId);
  const b = await ctx.reload();
  if (b && b.status === "paused") return { result: refuse("the plan is paused for safety"), touched: {} };
  if (!(access.creditId !== null || canAutoNext(access))) return { result: refuse("the member has no plan credit or membership; point them to the offer on Today"), touched: {} };
  // At most one open proposal: one made since the current block started.
  const since = b?.createdAt ?? new Date(0);
  const [open] = await db.select({ id: coachMessagesTable.id }).from(coachMessagesTable)
    .where(and(eq(coachMessagesTable.userId, ctx.userId), eq(coachMessagesTable.action, "build_block"), gt(coachMessagesTable.createdAt, since))).limit(1);
  if (open) return { result: refuse("a new-block button is already waiting in the chat"), touched: { message_id: open.id } };
  return { result: { ok: true, proposal: "build_block" }, touched: { plan_id: b?.planId ?? null } };
};

const swapExercise: Impl<"swap_exercise"> = async (input, ctx, changes) => {
  const b = await activeBlock(ctx);
  if (typeof b === "string") return { result: refuse(b), touched: {} };
  const item = b.sessions.flatMap((s) => s.items).find((i) => i.id === input.item_id);
  if (!item) return { result: refuse("no such item in the member's current block"), touched: { item_id: input.item_id } };
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(agentActionsTable).where(and(
    eq(agentActionsTable.userId, ctx.userId), eq(agentActionsTable.tool, "swap_exercise"),
    sql`${agentActionsTable.result}->>'ok' = 'true'`, sql`${agentActionsTable.touched}->>'plan_id' = ${String(b.planId)}`));
  if (n >= MAX_SWAPS_PER_BLOCK) return { result: refuse(`already ${MAX_SWAPS_PER_BLOCK} swaps in this block`), touched: { plan_id: b.planId } };
  const ex = EXERCISE_BY_ID.get(item.exerciseId);
  const coach = COACH_BY_ID.get(b.coachId);
  if (!ex || !coach) throw new Error("plan data missing");
  const missing = new Set<Equipment>(input.missing_equipment ?? []);
  const adjusted = {
    equipment: b.input.equipment.filter((e) => !missing.has(e)),
    avoidAreas: [...new Set<Area>([...b.input.avoidAreas, ...(input.avoid_area ? [input.avoid_area] : [])])],
    experience: b.input.experience,
  };
  const swap = findSwap(ex, adjusted, coach);
  if (!swap) return { result: refuse(`nothing in the library safely replaces ${ex.name} with that kit and those areas`), touched: { plan_id: b.planId, item_id: item.id } };
  // Every not-yet-done item of this exercise with no logged sets: the same rule as "This hurts".
  const targets = b.sessions.filter((s) => !s.done).flatMap((s) => s.items).filter((i) => i.exerciseId === ex.id && !i.logged);
  if (!targets.length) return { result: refuse("every session with that exercise is already done"), touched: { plan_id: b.planId, item_id: item.id } };
  const sameMeasure = swap.measure === ex.measure;
  const dose = (i: (typeof targets)[number]) => (sameMeasure ? { reps: i.reps, seconds: i.seconds } : swap.measure === "reps" ? { reps: 10, seconds: null } : { reps: null, seconds: 30 });
  // The changed block must pass the same checks as a rules-built one, against the input it was built from.
  const changed = asPlan(b);
  const ids = new Set(targets.map((t) => t.id));
  b.sessions.forEach((s, si) => s.items.forEach((i, ii) => {
    if (ids.has(i.id)) changed.sessions[si]!.items[ii] = { ...changed.sessions[si]!.items[ii]!, exerciseId: swap.id, targetLoadKg: null, ...dose(i) };
  }));
  const problems = validatePlan(changed, b.input);
  if (problems.length) return { result: refuse(`the swapped block failed checks: ${problems[0]}`), touched: { plan_id: b.planId, item_id: item.id } };
  const note = shown(input.reason, b, 140, `Swapped from ${ex.name} by your coach.`);
  await db.transaction(async (tx) => {
    for (const t of targets) {
      await tx.update(planItemsTable).set({ exerciseId: swap.id, swappedFrom: ex.id, targetLoadKg: null, changeNote: note, ...dose(t) })
        .where(eq(planItemsTable.id, t.id));
    }
  });
  changes.push({ tool: "swap_exercise", line: `I swapped ${ex.name} for ${swap.name} for the rest of this block.` });
  return { result: { ok: true, swapped_to: swap.name, swapped_to_id: swap.id, items: targets.length }, touched: { plan_id: b.planId, item_ids: [...ids], exercise_id: ex.id, swapped_to: swap.id } };
};

const setTargetLoad: Impl<"set_target_load"> = async (input, ctx, changes) => {
  const b = await activeBlock(ctx);
  if (typeof b === "string") return { result: refuse(b), touched: {} };
  const ex = EXERCISE_BY_ID.get(input.exercise_id);
  if (!ex || !ex.weighted) return { result: refuse("that exercise doesn't take a load"), touched: { exercise_id: input.exercise_id } };
  const open = b.sessions.filter((s) => !s.done).flatMap((s) => s.items).filter((i) => i.exerciseId === ex.id && !i.logged);
  if (!b.sessions.some((s) => s.items.some((i) => i.exerciseId === ex.id))) return { result: refuse("that exercise isn't in the current block"), touched: { exercise_id: ex.id } };
  if (!open.length) return { result: refuse("no sessions left with that exercise in this block"), touched: { exercise_id: ex.id } };
  const logs = (await memberLogs(ctx.userId)).filter((l) => l.exerciseId === ex.id && l.loadKg !== null);
  if (!logs.length) return { result: refuse("the member hasn't logged this exercise yet: ask them to log a set first"), touched: { exercise_id: ex.id } };
  const lastLogged = logs[0]!.loadKg!;
  // The engine's next load from this block's logs (as /me/plans/next would set it), else the last logged load.
  const engineNext = nextLoads(logs.filter((l) => l.planId === b.planId))[ex.id] ?? lastLogged;
  const cap = roundDownHalf(Math.min(engineNext, lastLogged) * 1.1);
  const floor = Math.ceil(engineNext * 0.5 * 2) / 2;
  const kg = roundDownHalf(input.units === "lb" ? input.load / LB_PER_KG : input.load);
  if (kg > cap) return { result: refuse(`too big a jump: the most is ${cap} kg (10% above recent work)`), touched: { exercise_id: ex.id } };
  if (kg < floor) return { result: refuse(`too big a drop: the least is ${floor} kg`), touched: { exercise_id: ex.id } };
  const after = { ...b, sessions: b.sessions.map((s) => ({ ...s, items: s.items.map((i) => (open.some((o) => o.id === i.id) ? { ...i, targetLoadKg: kg } : i)) })) };
  const note = shown(input.reason, after, 140, "Target set by your coach.");
  await db.update(planItemsTable).set({ targetLoadKg: kg, changeNote: note }).where(inArray(planItemsTable.id, open.map((o) => o.id)));
  changes.push({ tool: "set_target_load", line: `I set your ${ex.name} target to ${kg} kg for the rest of this block.` });
  return { result: { ok: true, exercise: ex.name, target_kg: kg, items: open.length }, touched: { plan_id: b.planId, exercise_id: ex.id, item_ids: open.map((o) => o.id), target_kg: kg } };
};

const writeMemory: Impl<"write_memory"> = async (input, ctx, changes) => {
  if (mentionsHealth(input.text)) return { result: refuse("health details are never stored; suggest a health professional instead"), touched: {} };
  if (filterReply(input.text, planNumbers(ctx.block), 200) !== null) return { result: refuse("that text can't be stored"), touched: {} };
  if (input.replaces_id !== undefined) {
    const updated = await db.update(coachMemoryTable).set({ kind: input.kind, text: input.text, source: "agent", updatedAt: new Date() })
      .where(and(eq(coachMemoryTable.id, input.replaces_id), eq(coachMemoryTable.userId, ctx.userId))).returning({ id: coachMemoryTable.id });
    if (!updated.length) return { result: refuse("no such memory item"), touched: { memory_id: input.replaces_id } };
    changes.push({ tool: "write_memory", line: "I've updated what I remember about you." });
    return { result: { ok: true, id: updated[0]!.id }, touched: { memory_id: updated[0]!.id } };
  }
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(coachMemoryTable).where(eq(coachMemoryTable.userId, ctx.userId));
  if (n >= MAX_MEMORY) return { result: refuse(`memory is full (${MAX_MEMORY} items): replace one with replaces_id`), touched: {} };
  const [row] = await db.insert(coachMemoryTable).values({ userId: ctx.userId, kind: input.kind, text: input.text, source: "agent" }).returning({ id: coachMemoryTable.id });
  changes.push({ tool: "write_memory", line: "I'll remember that." });
  return { result: { ok: true, id: row!.id }, touched: { memory_id: row!.id } };
};

const scheduleCheckin: Impl<"schedule_checkin"> = async (input, ctx, changes) => {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(checkinsTable).where(and(eq(checkinsTable.userId, ctx.userId), eq(checkinsTable.status, "pending")));
  if (n >= MAX_PENDING_CHECKINS) return { result: refuse(`already ${MAX_PENDING_CHECKINS} check-ins waiting`), touched: {} };
  if (filterReply(input.topic, planNumbers(ctx.block), 100) !== null) return { result: refuse("that topic can't be used"), touched: {} };
  const dueAt = checkinTime(new Date(), input.in_days, ctx.timezone);
  const [row] = await db.insert(checkinsTable).values({ userId: ctx.userId, dueAt, topic: input.topic }).returning({ id: checkinsTable.id });
  const when = new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: ctx.timezone ?? "UTC" }).format(dueAt);
  changes.push({ tool: "schedule_checkin", line: `I'll check in on ${when}.` });
  return { result: { ok: true, id: row!.id, due: dueAt.toISOString() }, touched: { checkin_id: row!.id } };
};

/** 9:00 on the member's local day, `days` days from now (spec §3). */
export function checkinTime(now: Date, days: number, tz: string | null): Date {
  return new Date(localDayStart(new Date(now.getTime() + days * 86_400_000), tz).getTime() + 9 * 3_600_000);
}

const TOOLS: { [N in ToolName]: Impl<N> } = {
  build_block: buildBlock,
  swap_exercise: swapExercise,
  set_target_load: setTargetLoad,
  write_memory: writeMemory,
  schedule_checkin: scheduleCheckin,
};

/** For the context: the member's memory, newest first. */
export async function memoryOf(userId: number) {
  return db.select({ id: coachMemoryTable.id, kind: coachMemoryTable.kind, text: coachMemoryTable.text, source: coachMemoryTable.source, updatedAt: coachMemoryTable.updatedAt })
    .from(coachMemoryTable).where(eq(coachMemoryTable.userId, userId)).orderBy(desc(coachMemoryTable.updatedAt)).limit(MAX_MEMORY);
}

/** Spec §4: items not updated in 180 days are removed (run by the weekly review job). */
export async function expireMemory(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 86_400_000);
  const gone = await db.delete(coachMemoryTable).where(sql`${coachMemoryTable.updatedAt} < ${cutoff}`).returning({ id: coachMemoryTable.id });
  return gone.length;
}

/** Spec §7: agent_actions are kept 180 days. */
export async function expireActions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 86_400_000);
  const gone = await db.delete(agentActionsTable).where(sql`${agentActionsTable.at} < ${cutoff}`).returning({ id: agentActionsTable.id });
  return gone.length;
}

