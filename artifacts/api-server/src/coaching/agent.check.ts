// Coach agent checks (build plan 2.3–2.5; the 30 eval cases of docs/COACH-AGENT-SPEC.md §11). LOCAL DATABASE ONLY; never
// calls Anthropic. Pure checks always run. The rest runs when AI_CHECK_API points at a local API started with
// ANTHROPIC_API_KEY=<anything> AI_MONTHLY_BUDGET_USD=1 ANTHROPIC_BASE_URL=http://localhost:<AI_CHECK_FAKE_PORT>, and this
// script serves a SCRIPTED fake Claude API on that port: each test queues the replies (text or tool calls) it expects.
import assert from "node:assert/strict";
import http from "node:http";
import { SCREENING } from "./screening";
import { filterReply, trainingNumbersMatch } from "./output-filter";
import { mentionsHealth } from "./health-words";
import { DEFAULT_ALLOWANCES, CHAT_TOOLS, DEFAULT_CAPS_MICRO_USD } from "./allowance";
import { retryWaitMs, costMicroUsd } from "../lib/ai";
import { checkinTime } from "./agent-tools";
import { isLocalSunday, isReviewTime } from "./coach-jobs";
import { screenMessage } from "./chat";
import { COACH_PROMPTS } from "./prompts";
import { COACHES } from "./library";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- pure ----------
const plan = { sets: [3], reps: [8, 10], seconds: [90, 30], loadsKg: [60] };
ok(filterReply("Keep your chest up and drive through your heels.", plan) === null, "a normal form cue passes (chest up is a cue)");
ok(filterReply("You have 2 sessions left this week.", plan) === null, "plain numbers pass");
ok(filterReply("3x8 at 60 kg, rest 90 seconds.", plan) === null, "numbers that match the plan pass");
ok(filterReply("Do 5x5 at 100 kg today.", plan) === "plan_number", "numbers that contradict the plan are dropped");
ok(filterReply("Try 132 lb.", plan) === null && filterReply("Try 200 lb.", plan) === "plan_number", "lb compared with the kg target");
ok(filterReply("Go 10% heavier.", plan) === "plan_number", "percent changes are dropped");
ok(filterReply("Aim for 2,000 kcal a day.", plan) === "dose", "calories dropped");
ok(filterReply("Have 30 g of protein after.", plan) === "dose", "grams of anything dropped");
ok(filterReply("Creatine can help.", plan) === "medicine", "supplements dropped");
ok(filterReply("Sounds like tendinitis.", plan) === "diagnosis", "diagnosis words dropped");
ok(filterReply("Just push through it.", plan) === "encourages_pain", "push through dropped");
ok(filterReply("Read more at example.com", plan) === "link", "links dropped");
ok(filterReply("If you feel sharp pain, stop.", plan) === "warning_word", "warning words dropped");
ok(filterReply("x".repeat(601), plan) === "length", "long replies dropped");
ok(trainingNumbersMatch("3 sets of 10", plan) && !trainingNumbersMatch("4 sets of 10", plan), "sets of reps checked");
ok(mentionsHealth("I have type 1 diabetes") && mentionsHealth("my ACL surgery") && !mentionsHealth("I train before work on Tuesdays"), "health words");
ok(screenMessage("I feel like ending it all").kind === "wellbeing" && screenMessage("I don’t want to be here anymore").kind === "wellbeing", "new wellbeing phrases, curly apostrophe too");
ok(retryWaitMs(529, null) === 1500 && retryWaitMs(429, "3") === 3000 && retryWaitMs(503, "60") === 5000 && retryWaitMs(400, null) === null, "retry waits");
ok(costMicroUsd("quick", 1000, 0, 1000, 1000) === Math.round((1000 + 1250 + 100) * 0.1), "cache writes 1.25×, reads 0.1×");
ok(DEFAULT_ALLOWANCES.tier2.chat.perDay === 20 && DEFAULT_ALLOWANCES.tier2.chat.perMonth === 300 && DEFAULT_ALLOWANCES.tier1.chat.perDay === 3 && DEFAULT_ALLOWANCES.plan.chat.perDay === 0, "allowances as approved");
ok(DEFAULT_CAPS_MICRO_USD.none === 0 && DEFAULT_CAPS_MICRO_USD.tier1 === 500_000 && DEFAULT_CAPS_MICRO_USD.tier2 === 2_000_000 && DEFAULT_CAPS_MICRO_USD.tier3 === 3_500_000, "member caps per tier (spec 3.1 §2)");
ok(Object.values(DEFAULT_ALLOWANCES.none).every((r) => r.perMonth === 0), "Free makes no AI calls at all");
ok(!CHAT_TOOLS.tier1.includes("swap_exercise") && !CHAT_TOOLS.tier1.includes("set_target_load") && CHAT_TOOLS.tier2.length === 5, "Plans chat can't swap or change loads");
ok(COACHES.every((c) => COACH_PROMPTS[c.id]?.lines.limit && COACH_PROMPTS[c.id]?.lines.fallback), "every coach has a prompt file with fixed lines");
ok(checkinTime(new Date("2026-11-05T02:00:00Z"), 3, "Australia/Brisbane").toISOString() === "2026-11-07T23:00:00.000Z", "check-in at 9:00 local, 3 days out");
ok(isLocalSunday(new Date("2026-11-08T03:00:00Z"), "UTC") && !isLocalSunday(new Date("2026-11-08T15:00:00Z"), "Australia/Brisbane"), "Sunday where the member lives");
ok(!isReviewTime(new Date("2026-11-08T10:00:00Z"), "UTC") && isReviewTime(new Date("2026-11-08T19:00:00Z"), "UTC") && isReviewTime(new Date("2026-11-08T08:30:00Z"), "Australia/Brisbane"), "the review goes out Sunday evening, local time");

// ---------- with the scripted fake model ----------
const api = process.env["AI_CHECK_API"];
const fakePort = Number(process.env["AI_CHECK_FAKE_PORT"] ?? 0);
if (!api || !fakePort) {
  console.log(`agent checks passed: ${n} (HTTP part skipped: set AI_CHECK_API and AI_CHECK_FAKE_PORT)`);
  process.exit(0);
}
// In-process turns (the jobs) talk to the same fake.
process.env["ANTHROPIC_API_KEY"] = "check-dummy";
process.env["AI_MONTHLY_BUDGET_USD"] = "1";
process.env["ANTHROPIC_BASE_URL"] = `http://localhost:${fakePort}`;

const { db, usersTable, plansTable, planItemsTable, setLogsTable, aiUsageTable, aiLedgerDailyTable, aiLedgerMonthlyTable, agentActionsTable, coachMemoryTable, checkinsTable, coachMessagesTable, weeklyReviewsTable, membershipsTable } = await import("@workspace/db");
const { and, eq, desc, inArray, sql } = await import("drizzle-orm");
const { EXERCISE_BY_ID, EXERCISES } = await import("./library");
const { STOP_MESSAGE, WELLBEING_MESSAGE } = await import("./chat");
const { runTurn, buildContext } = await import("./agent");
const { runWeeklyReviews, runDueCheckins } = await import("./coach-jobs");
const { dayOf, monthOf } = await import("./allowance");

type Reply = { status?: number; content?: unknown[]; stop_reason?: string };
const queue: Reply[] = [];
const seen: { system: unknown; messages: unknown[]; tools?: { name: string }[] }[] = [];
let toolSeq = 0;
const say = (text: string): Reply => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });
const tool = (name: string, input: unknown, text?: string): Reply => ({ content: [...(text ? [{ type: "text", text }] : []), { type: "tool_use", id: `tu_${++toolSeq}`, name, input }], stop_reason: "tool_use" });
const tools = (...uses: [string, unknown][]): Reply => ({ content: uses.map(([name, input]) => ({ type: "tool_use", id: `tu_${++toolSeq}`, name, input })), stop_reason: "tool_use" });
const fake = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw);
    seen.push(body);
    // Plan notes use a plain string system prompt: answer them like the old fake did.
    if (typeof body.system === "string" && body.system.includes("Reply with ONLY a JSON object")) {
      const sessions = (JSON.parse(body.messages.at(-1).content) as { sessions: { week: number; day: number }[] }).sessions;
      res.writeHead(200, { "content-type": "application/json" });
      return void res.end(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ intro: "Welcome to your block.", notes: sessions.map((s) => ({ week: s.week, day: s.day, note: "Smooth reps today." })) }) }], stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 300 } }));
    }
    const next = queue.shift() ?? say("Good work. Keep going.");
    if (next.status && next.status !== 200) { res.writeHead(next.status, { "content-type": "application/json" }); return void res.end(JSON.stringify({ error: { type: "overloaded_error" } })); }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: next.content, stop_reason: next.stop_reason, usage: { input_tokens: 1200, output_tokens: 60, cache_read_input_tokens: 800 } }));
  });
}).listen(fakePort);

function browser() {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
}
type Call = ReturnType<typeof browser>;
const no = SCREENING.questions.map(() => false);
let seq = 0;
async function member(opts: { tier?: "tier1" | "tier2" | "intro_plan"; coach?: string; goal?: string; equipment?: string[]; plan?: boolean } = {}) {
  const call = browser();
  const email = `agent-check-${Date.now()}-${++seq}@example.test`;
  assert.equal((await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: "Agent Check", adult_confirmed: true })).status, 201);
  assert.equal((await call("PUT", "/me/training/profile", { coach_id: opts.coach ?? "rex", goal: opts.goal ?? "strength", experience: "intermediate", days_per_week: 3, minutes: 45, equipment: opts.equipment ?? ["barbell", "dumbbells"], avoid_areas: [], health_accepted: true, screening: { answers: no, cleared: false } })).status, 200);
  assert.equal((await call("POST", "/dev/unlock", { kind: opts.tier ?? "tier2" })).status, 200);
  if (opts.plan !== false) assert.equal((await call("POST", "/me/plans")).status, 201);
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  const training = (await call("GET", "/me/training")).json;
  return { call, id: u!.id, plan: training.plan as { id: number; sessions: { id: number; week: number; completed_at: string | null; items: { id: number; exercise_id: string; reps: number | null; sets: number; weighted: boolean; target_load_kg: number | null }[] }[] } | null };
}
const chat = (c: Call, text: string) => c("POST", "/me/coach/messages", { text });
const lastCoach = (r: { json: { messages: { role: string; text: string; action: string | null }[] } }) => r.json.messages.at(-1)!;
const actions = async (userId: number) => db.select().from(agentActionsTable).where(eq(agentActionsTable.userId, userId)).orderBy(agentActionsTable.id);
const items = (p: NonNullable<Awaited<ReturnType<typeof member>>["plan"]>) => p.sessions.flatMap((s) => s.items);
const settle = () => new Promise((r) => setTimeout(r, 50));

// Plan notes arrive on request (spec §12), once.
{
  const m = await member({ plan: true });
  ok(m.plan && (await m.call("GET", "/me/training")).json.plan.notes_status === "pending", "new block: notes pending");
  const before = seen.length;
  const withNotes = await m.call("POST", `/me/plans/${m.plan!.id}/notes`);
  ok(withNotes.status === 200 && withNotes.json.intro === "Welcome to your block." && withNotes.json.notes_status === "done", "notes written on request");
  await m.call("POST", `/me/plans/${m.plan!.id}/notes`);
  ok(seen.length === before + 1, "asked twice: one model call");
  const other = await member({ plan: false });
  ok((await other.call("POST", `/me/plans/${m.plan!.id}/notes`)).status === 404, "another member's plan: 404");
}

// 1. Warning words: the rule stops it, no model call, plan paused, nothing counted.
{
  const m = await member();
  const before = seen.length;
  const r = await chat(m.call, "Sharp pain in my knee on squats");
  ok(lastCoach(r).text === STOP_MESSAGE && seen.length === before, "case 1: stop message, no model call");
  ok((await m.call("GET", "/me/training")).json.plan.status === "paused", "case 1: plan paused");
  const [d] = await db.select().from(aiLedgerDailyTable).where(eq(aiLedgerDailyTable.userId, m.id));
  ok(!d || d.calls === 0, "case 1: not counted");
  // Case 30: paused plan → every tool except write_memory refuses.
  queue.push(tools(["swap_exercise", { item_id: items(m.plan!)[0]!.id, reason: "x" }], ["write_memory", { kind: "preference", text: "Likes early sessions" }], ["schedule_checkin", { in_days: 2, topic: "Squat form" }]), say("Your plan is paused. Resume it from the plan screen when you've been checked."));
  await chat(m.call, "can you change today's session?");
  const acts = await actions(m.id);
  ok((acts.find((a) => a.tool === "schedule_checkin")!.result as { ok: boolean }).ok === false, "case 30: no check-ins while paused");
  ok(acts.find((a) => a.tool === "swap_exercise")?.result && (acts.find((a) => a.tool === "swap_exercise")!.result as { ok: boolean }).ok === false, "case 30: swap refused while paused");
  ok((acts.find((a) => a.tool === "write_memory")!.result as { ok: boolean }).ok === true, "case 30: memory still works while paused");
}

// 2. Wellbeing words: the help message, no model call.
{
  const m = await member();
  const before = seen.length;
  const r = await chat(m.call, "I feel like ending it all");
  ok(lastCoach(r).text === WELLBEING_MESSAGE && seen.length === before, "case 2: help message, no model call");
}

// 3. No barbell: every open item of that exercise swapped to one that needs no barbell; the plan still passes checks.
{
  const m = await member();
  const barbellOnly = items(m.plan!).find((i) => { const e = EXERCISE_BY_ID.get(i.exercise_id)!; return e.equipment.length === 1 && e.equipment[0] === "barbell"; });
  ok(barbellOnly, "case 3: the plan has a barbell-only lift");
  queue.push(tool("swap_exercise", { item_id: barbellOnly!.id, missing_equipment: ["barbell"], reason: "No barbell at your gym, so this uses dumbbells." }), say("Done. Swapped for the rest of the block."));
  const r = await chat(m.call, "My gym has no barbell, swap it");
  ok(r.status === 200 && lastCoach(r).text.startsWith("Done"), "case 3: reply shown");
  const after = (await m.call("GET", "/me/training")).json.plan;
  const left = after.sessions.filter((s: { completed_at: string | null }) => !s.completed_at).flatMap((s: { items: { exercise_id: string }[] }) => s.items).filter((i: { exercise_id: string }) => i.exercise_id === barbellOnly!.exercise_id);
  ok(left.length === 0, "case 3: no open item of that lift left");
  const swapped = after.sessions.flatMap((s: { items: { swapped_from: string | null; exercise_id: string; change_note: string | null }[] }) => s.items).filter((i: { swapped_from: string | null }) => i.swapped_from === barbellOnly!.exercise_id);
  ok(swapped.length > 0 && swapped.every((i: { exercise_id: string; change_note: string | null }) => { const e = EXERCISE_BY_ID.get(i.exercise_id)!; return (e.equipment.length === 0 || e.equipment.some((q) => q !== "barbell")) && i.change_note?.startsWith("No barbell"); }), "case 3: replacement needs no barbell, and the why line is shown");

  // 4. A 4th swap in one block is refused.
  const turn = "check-turn";
  await db.insert(agentActionsTable).values([1, 2].map(() => ({ userId: m.id, turnId: turn, tool: "swap_exercise", touched: { plan_id: String(m.plan!.id) }, result: { ok: true }, promptVersion: "check" })));
  const another = items(m.plan!).find((i) => i.exercise_id !== barbellOnly!.exercise_id && !EXERCISE_BY_ID.get(i.exercise_id)!.equipment.includes("barbell"))!;
  queue.push(tool("swap_exercise", { item_id: another.id, reason: "Variety." }), say("That's the most swaps for this block."));
  await chat(m.call, "swap another one");
  const last = (await actions(m.id)).filter((a) => a.tool === "swap_exercise").at(-1)!;
  ok((last.result as { ok: boolean; reason?: string }).ok === false && /3 swaps/.test((last.result as { reason: string }).reason), "case 4: 4th swap refused");

  // 29. Another member's item: refused.
  const other = await member();
  queue.push(tool("swap_exercise", { item_id: items(m.plan!)[0]!.id, reason: "x" }), say("I can't change that."));
  await chat(other.call, "swap item");
  const o = (await actions(other.id)).at(-1)!;
  ok((o.result as { ok: boolean; reason: string }).ok === false && /no such item/.test((o.result as { reason: string }).reason), "case 29: another member's item refused");
}

// 5–8. Target loads: capped from the logs, floored, only for logged exercises in the block.
{
  const m = await member();
  const weighted = items(m.plan!).filter((i) => i.weighted && i.reps !== null);
  const lift = weighted[0]!;
  const logged = m.plan!.sessions[0]!.items.find((i) => i.exercise_id === lift.exercise_id) ?? lift;
  for (let s = 1; s <= logged.sets; s += 1) assert.equal((await m.call("PUT", `/me/items/${logged.id}/sets/${s}`, { reps: logged.reps, seconds: null, load_kg: 60 })).status, 200);
  const ctx5 = await buildContext(m.id, null, "tier2", CHAT_TOOLS.tier2);
  ok(ctx5?.system[0]!.text.includes(`${EXERCISE_BY_ID.get(lift.exercise_id)!.name}: ${logged.sets} sets over 0 months, started 60 kg, best 60 kg`), "the lifetime summary: one fixed line per exercise, no old logs");
  // nextLoads: every target rep hit at 60 → 63; cap = min(63, 60) × 1.1 = 66; floor = 31.5.
  queue.push(tool("set_target_load", { exercise_id: lift.exercise_id, load: 80, units: "kg", reason: "Heavier." }), say("That jump is too big."));
  await chat(m.call, "Make it 20 kg heavier");
  let a = (await actions(m.id)).at(-1)!;
  ok((a.result as { ok: boolean; reason: string }).ok === false && /66 kg/.test((a.result as { reason: string }).reason), "case 5: 80 kg refused, the most is 66");
  queue.push(tool("set_target_load", { exercise_id: lift.exercise_id, load: 66, units: "kg", reason: "You hit every rep." }), say("Set."));
  await chat(m.call, "ok go to 66");
  const rows = await db.select({ t: planItemsTable.targetLoadKg, note: planItemsTable.changeNote }).from(planItemsTable).where(eq(planItemsTable.exerciseId, lift.exercise_id));
  ok(rows.some((r) => r.t === 66 && r.note === "You hit every rep."), "case 5: 66 kg set, with the why line");
  ok(!(await db.select().from(setLogsTable).where(eq(setLogsTable.itemId, logged.id))).some((l) => l.loadKg === 66), "case 5: logged sets untouched");
  queue.push(tool("set_target_load", { exercise_id: lift.exercise_id, load: 20, units: "kg", reason: "Lighter." }), say("Too low."));
  await chat(m.call, "drop it right down");
  a = (await actions(m.id)).at(-1)!;
  ok((a.result as { ok: boolean }).ok === false, "case 6: below half the engine's load refused");
  queue.push(tool("set_target_load", { exercise_id: lift.exercise_id, load: 50, units: "kg", reason: "Felt heavy." }), say("Lowered."));
  await chat(m.call, "it felt heavy, lower it");
  ok(((await actions(m.id)).at(-1)!.result as { ok: boolean }).ok === true, "case 6: lowering allowed");
  const notIn = EXERCISES.find((e) => e.weighted && !items(m.plan!).some((i) => i.exercise_id === e.id))!;
  queue.push(tool("set_target_load", { exercise_id: notIn.id, load: 20, units: "kg", reason: "x" }), say("Not in your plan."));
  await chat(m.call, `set ${notIn.name} to 20`);
  ok(/isn't in the current block/.test(((await actions(m.id)).at(-1)!.result as { reason: string }).reason), "case 7: exercise not in the block refused");
  const unlogged = weighted.find((i) => i.exercise_id !== lift.exercise_id);
  if (unlogged) {
    queue.push(tool("set_target_load", { exercise_id: unlogged.exercise_id, load: 20, units: "kg", reason: "x" }), say("Log a set first."));
    await chat(m.call, "set the other one");
    ok(/hasn't logged/.test(((await actions(m.id)).at(-1)!.result as { reason: string }).reason), "case 8: never logged refused");
  }
}

// 9–13. Memory and the new-block button.
{
  const m = await member();
  queue.push(tools(["write_memory", { kind: "schedule", text: "Trains Tuesdays and Thursdays only" }], ["build_block", { reason: "Schedule changed" }]), say("Noted. Tap below when you want the new block."));
  const r = await chat(m.call, "I only have Tuesdays and Thursdays now");
  ok(lastCoach(r).action === "build_block", "case 9: the coach offers a new block");
  ok((await db.select().from(plansTable).where(eq(plansTable.userId, m.id))).length === 1, "case 9: nothing built until the member taps");
  queue.push(tool("write_memory", { kind: "preference", text: "Prefers morning sessions" }), say("Mornings it is."));
  await chat(m.call, "I prefer mornings");
  const mem = (await m.call("GET", "/me/coach/memory")).json.items;
  ok(mem.length === 2 && mem.some((x: { text: string }) => x.text === "Prefers morning sessions"), "case 11: memory listed on Me");
  const morning = mem.find((x: { text: string }) => x.text === "Prefers morning sessions");
  ok((await m.call("PATCH", `/me/coach/memory/${morning.id}`, { text: "My knee surgery was last year" })).status === 400, "member can't store health details either");
  ok((await m.call("DELETE", `/me/coach/memory/${morning.id}`)).status === 204, "case 12: member deletes it");
  ok((await db.select().from(coachMemoryTable).where(eq(coachMemoryTable.id, morning.id))).length === 0, "case 12: gone at once");
  const ctx = await buildContext(m.id, null, "tier2", CHAT_TOOLS.tier2);
  ok(ctx && !ctx.system[0]!.text.includes("Prefers morning sessions") && ctx.system[0]!.text.includes("Tuesdays and Thursdays"), "case 12: deleted memory left the context");
  ok(!JSON.stringify(seen.slice(-3)).includes("Agent Check") && !JSON.stringify(seen.slice(-3)).includes("@example.test"), "no name or email sent to the model");
  queue.push(tool("write_memory", { kind: "goal_detail", text: "Has type 1 diabetes" }), say("Please talk to your doctor about that; I'll stick to training."));
  await chat(m.call, "I have type 1 diabetes");
  ok(((await actions(m.id)).at(-1)!.result as { ok: boolean }).ok === false && (await db.select().from(coachMemoryTable).where(eq(coachMemoryTable.userId, m.id))).length === 1, "case 13: health detail never stored");

  // 10. No credit and no membership: no button.
  const one = await member({ tier: "intro_plan" }); // the intro plan was spent building the block
  queue.push(tool("build_block", { reason: "New block" }), say("You'll need a plan or membership first: see the offer on Today."));
  const turn = await runTurn({ userId: one.id, timezone: null, level: "tier1", kind: "chat", tools: ["build_block"], userText: "new block please" });
  const ten = (await actions(one.id)).filter((x) => x.tool === "build_block");
  ok(ten.length === 1 && (ten[0]!.result as { ok: boolean; reason: string }).ok === false && /no plan credit/.test((ten[0]!.result as { reason: string }).reason) && !turn.proposal, "case 10: no credit or membership: no button");
}

// 14–15, 19–22. The output filter on real turns.
{
  const m = await member();
  const drop = async (reply: string, rule: string, label: string) => {
    queue.push(say(reply));
    const r = await chat(m.call, "question");
    const fallback = COACH_PROMPTS["rex"]!.lines.fallback;
    const a = (await actions(m.id)).at(-1)!;
    ok(lastCoach(r).text === fallback && a.tool === "filter_drop" && (a.result as { rule: string }).rule === rule && JSON.stringify(a).indexOf(reply) === -1, label);
  };
  await drop("Aim for 2,000 kcal a day.", "dose", "case 14: calories dropped, fallback shown, no text logged");
  await drop("Creatine will help you recover.", "medicine", "case 15: supplements dropped");
  await drop("See www.example.com for more.", "link", "case 19: links dropped");
  await drop("Do 5x5 at 100 kg today.", "plan_number", "case 20: numbers that contradict the plan dropped");
  queue.push(say("You have 2 sessions left this week. Keep going."));
  ok(lastCoach(await chat(m.call, "how many left?")).text.startsWith("You have 2 sessions"), "case 21: plain numbers pass");
  const it = items(m.plan!).find((i) => { const e = EXERCISE_BY_ID.get(i.exercise_id)!; return e.equipment.length === 1 && e.equipment[0] === "barbell"; })!;
  queue.push(tool("swap_exercise", { item_id: it.id, missing_equipment: ["barbell"], reason: "No barbell today." }), say("Swapped. Visit example.com for the video."));
  const r = await chat(m.call, "swap it");
  ok(lastCoach(r).text.includes("Let me come back to you on that.") && lastCoach(r).text.includes("I swapped"), "case 22: dropped reply still says what changed");
}

// 16–18. Check-ins and the tool-step limit.
{
  const m = await member();
  queue.push(tool("schedule_checkin", { in_days: 3, topic: "How the new squat felt" }), say("I'll check in."));
  await chat(m.call, "check in with me in 3 days");
  const [c] = await db.select().from(checkinsTable).where(eq(checkinsTable.userId, m.id));
  ok(c && c.status === "pending" && c.dueAt.getUTCHours() === 9, "case 16: check-in at 9:00 local (UTC member)");
  queue.push(tools(["schedule_checkin", { in_days: 5, topic: "Sleep" }], ["schedule_checkin", { in_days: 6, topic: "Energy" }]), say("Two more."));
  await chat(m.call, "and again twice");
  const pending = await db.select().from(checkinsTable).where(and(eq(checkinsTable.userId, m.id), eq(checkinsTable.status, "pending")));
  ok(pending.length === 2 && ((await actions(m.id)).at(-1)!.result as { ok: boolean }).ok === false, "case 17: a third pending check-in refused");
  const before = seen.length;
  queue.push(...[1, 2, 3, 4].map((i) => tool("write_memory", { kind: "motivation", text: `Reason ${i}` })), say("unused"));
  await chat(m.call, "remember lots");
  const turnId = (await actions(m.id)).at(-1)!.turnId;
  const turnActs = (await actions(m.id)).filter((a) => a.turnId === turnId);
  ok(turnActs.filter((a) => a.tool === "write_memory").length === 3 && seen.length - before === 4, `case 18: 3 tool steps, then the loop stops (${turnActs.length} actions, ${seen.length - before} calls)`);
  ok(turnActs.some((a) => a.tool === "filter_drop"), "case 18: no answer text after the limit: the fallback (logged as a drop)");
  queue.length = 0;

  // Due check-ins are sent by the job (step 2.5).
  await db.update(checkinsTable).set({ dueAt: new Date(Date.now() - 60_000) }).where(eq(checkinsTable.id, c!.id));
  queue.push(say("How did the new squat feel this week?"));
  await runDueCheckins(new Date(), { userIds: [m.id] });
  const [sent] = await db.select().from(checkinsTable).where(eq(checkinsTable.id, c!.id));
  const [msg] = await db.select().from(coachMessagesTable).where(and(eq(coachMessagesTable.userId, m.id), eq(coachMessagesTable.source, "checkin")));
  ok(sent?.status === "sent" && msg?.text.startsWith("How did") && sent.messageId === msg.id, "due check-in sent once, into the chat");
  queue.length = 0;
}

// 23–26. Limits, races, caps, budget.
{
  const m = await member();
  const day = dayOf(new Date(), null);
  await db.insert(aiLedgerDailyTable).values({ userId: m.id, day, kind: "chat", calls: 20 }).onConflictDoUpdate({ target: [aiLedgerDailyTable.userId, aiLedgerDailyTable.day, aiLedgerDailyTable.kind], set: { calls: 20 } });
  let before = seen.length;
  const limited = await chat(m.call, "one more");
  ok(limited.status === 429 && limited.json.message === COACH_PROMPTS["rex"]!.lines.limit && seen.length === before, "case 23: the coach's limit line, no model call");
  ok((await chat(m.call, "Sharp pain in my chest")).json.messages.at(-1).text === STOP_MESSAGE, "at the limit, warning words still stop the plan (spec §6.1 fix)");
  await db.update(plansTable).set({ status: "active", pausedReason: null }).where(eq(plansTable.userId, m.id));
  await db.update(aiLedgerDailyTable).set({ calls: 19 }).where(and(eq(aiLedgerDailyTable.userId, m.id), eq(aiLedgerDailyTable.day, day)));
  queue.push(say("First."), say("Second."));
  const both = await Promise.all([chat(m.call, "a"), chat(m.call, "b")]);
  ok(both.filter((r) => r.status === 200).length === 1 && both.filter((r) => r.status === 429).length === 1, "case 24: two at once with 1 left: exactly one answered");
  queue.length = 0;
  await db.update(aiLedgerDailyTable).set({ calls: 0 }).where(and(eq(aiLedgerDailyTable.userId, m.id), eq(aiLedgerDailyTable.day, day)));
  await db.update(aiLedgerMonthlyTable).set({ costMicroUsd: DEFAULT_CAPS_MICRO_USD.tier2 }).where(and(eq(aiLedgerMonthlyTable.userId, m.id), eq(aiLedgerMonthlyTable.month, monthOf(new Date()))));
  before = seen.length;
  ok((await chat(m.call, "hi")).status === 429 && seen.length === before, "case 25: member cap reached: no model call");
  const item = items(m.plan!).find((i) => i.reps !== null)!;
  ok((await m.call("PUT", `/me/items/${item.id}/sets/1`, { reps: 5, seconds: null, load_kg: null })).status === 200, "case 25: logging still works");
  await db.update(aiLedgerMonthlyTable).set({ costMicroUsd: 0 }).where(eq(aiLedgerMonthlyTable.userId, m.id));
  const [spent] = await db.insert(aiUsageTable).values({ purpose: "chat", model: "check", inputTokens: 0, outputTokens: 0, costMicroUsd: 1_000_000, ok: true }).returning({ id: aiUsageTable.id });
  try {
    before = seen.length;
    ok((await chat(m.call, "hi")).status === 503 && seen.length === before, "case 26: global budget spent: chat off, no model call");
  } finally {
    await db.delete(aiUsageTable).where(eq(aiUsageTable.id, spent!.id)); // never leave the budget spent for later checks
  }
  const [daily] = await db.select().from(aiLedgerDailyTable).where(and(eq(aiLedgerDailyTable.userId, m.id), eq(aiLedgerDailyTable.day, day)));
  ok(daily?.calls === 0, "refused turns are not counted");
}

// 27–28. Model errors and tool errors.
{
  const m = await member();
  let before = seen.length;
  queue.push({ status: 529 }, say("Back again. Brace hard."));
  const r = await chat(m.call, "how do I brace?");
  ok(lastCoach(r).text === "Back again. Brace hard." && seen.length - before === 2, "case 27: one retry after a 529");
  before = seen.length;
  queue.push({ status: 529 }, { status: 529 });
  ok(lastCoach(await chat(m.call, "again?")).text === COACH_PROMPTS["rex"]!.lines.fallback && seen.length - before === 2, "case 27: two 529s: the fallback, no more tries");
  // A tool that throws (broken plan record): no change, the fallback.
  const [p] = await db.select({ record: plansTable.record }).from(plansTable).where(eq(plansTable.id, m.plan!.id));
  const broken = { ...(p!.record as { input: Record<string, unknown> }), input: { ...(p!.record as { input: Record<string, unknown> }).input, equipment: undefined } };
  await db.update(plansTable).set({ record: broken }).where(eq(plansTable.id, m.plan!.id));
  const target = items(m.plan!)[0]!;
  queue.push(tool("swap_exercise", { item_id: target.id, reason: "x" }), say("never"));
  ok(lastCoach(await chat(m.call, "swap")).text === COACH_PROMPTS["rex"]!.lines.fallback, "case 28: a tool error ends with the fallback");
  const [still] = await db.select({ e: planItemsTable.exerciseId }).from(planItemsTable).where(eq(planItemsTable.id, target.id));
  ok(still?.e === target.exercise_id, "case 28: nothing changed");
  queue.length = 0;
}

// Plans (tier1): chat with memory and the button, but no swaps; Today's note once a day.
{
  const m = await member({ tier: "tier1" });
  const chatState = (await m.call("GET", "/me/coach/messages")).json;
  ok(chatState.enabled && chatState.per_day === 3, "Plans: chat on, 3 a day");
  queue.push(say("Good morning. Short session today."));
  const note = await m.call("POST", "/me/coach/daily-note");
  const before = seen.length;
  const again = await m.call("POST", "/me/coach/daily-note");
  ok(note.json.note === "Good morning. Short session today." && again.json.note === note.json.note && seen.length === before, "Today's note: written once a day");
  const toolsSent = seen.at(-1)!.tools?.map((t) => t.name) ?? [];
  ok(toolsSent.join() === "write_memory", "daily note: memory tool only");
  queue.push(say("Hi."));
  await chat(m.call, "hi");
  ok(!(seen.at(-1)!.tools ?? []).some((t) => t.name === "swap_exercise" || t.name === "set_target_load"), "Plans chat: no swap or load tools sent");
  const none = await member({ tier: "intro_plan" });
  ok((await chat(none.call, "hi")).status === 402 && (await none.call("POST", "/me/coach/daily-note")).json.note === null, "one-off plan: no chat, no note");
}

// Weekly review (step 2.5): on the member's Sunday, once; no logs → no load changes.
{
  const m = await member();
  const sunday = new Date();
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7));
  sunday.setUTCHours(19, 0, 0, 0); // Sunday evening for a UTC member
  const lift = items(m.plan!).find((i) => i.weighted)!;
  const targetsBefore = await db.select({ t: planItemsTable.targetLoadKg }).from(planItemsTable).where(eq(planItemsTable.exerciseId, lift.exercise_id));
  // The model tries to raise a load anyway: with no sets this week the tool is not even offered.
  queue.push(tool("set_target_load", { exercise_id: lift.exercise_id, load: 100, units: "kg", reason: "Go heavier." }), say("Missed you this week. This week, just start with day one."));
  await runWeeklyReviews(sunday, { userIds: [m.id] });
  queue.length = 0;
  const [rev] = await db.select().from(weeklyReviewsTable).where(eq(weeklyReviewsTable.userId, m.id));
  const [msg] = await db.select().from(coachMessagesTable).where(and(eq(coachMessagesTable.userId, m.id), eq(coachMessagesTable.source, "weekly_review")));
  ok(rev?.status === "done" && msg?.text.startsWith("Missed you") && msg.id === rev.messageId, "weekly review written on Sunday evening, into the chat");
  const reviewTools = (seen.at(-2)!.tools ?? []).map((t) => t.name);
  ok(!reviewTools.includes("set_target_load"), "no sets this week: the load tool isn't offered");
  const targetsAfter = await db.select({ t: planItemsTable.targetLoadKg }).from(planItemsTable).where(eq(planItemsTable.exerciseId, lift.exercise_id));
  ok(JSON.stringify(targetsAfter) === JSON.stringify(targetsBefore) && !(await actions(m.id)).some((a) => a.tool === "set_target_load"), "no logs: no load changes");
  const before = seen.length;
  await runWeeklyReviews(sunday, { userIds: [m.id] });
  ok(seen.length === before && (await db.select().from(weeklyReviewsTable).where(eq(weeklyReviewsTable.userId, m.id))).length === 1, "once per week");
  const tier1 = await member({ tier: "tier1" });
  await runWeeklyReviews(sunday, { userIds: [tier1.id] });
  ok((await db.select().from(weeklyReviewsTable).where(eq(weeklyReviewsTable.userId, tier1.id))).length === 0, "Plans members get no weekly review");
  const today = (await m.call("POST", "/me/coach/daily-note")).json;
  ok(today.updates.some((u: { source: string }) => u.source === "weekly_review"), "the review shows on Today");
}

// Account delete and export cover the agent's data.
{
  const m = await member();
  queue.push(tool("write_memory", { kind: "equipment", text: "Home gym with a rack" }), say("Noted."));
  await chat(m.call, "I have a rack at home");
  const exported = (await m.call("GET", "/me/export")).json;
  ok(exported.coach_memory?.length === 1 && exported.coach_actions?.length >= 1 && Array.isArray(exported.ai_use), "export includes memory, actions and AI use");
  const { deleteAccount } = await import("../account/delete");
  await deleteAccount(m.id, null);
  const left = await Promise.all([coachMemoryTable, agentActionsTable, aiLedgerMonthlyTable].map((t) => db.select().from(t).where(eq(t.userId, m.id))));
  ok(left.every((rows) => rows.length === 0), "delete removes memory, actions and ledger");
}

void desc; void inArray; void sql; void membershipsTable; void settle;
fake.close();
console.log(`agent checks passed: ${n}`);
process.exit(0);
