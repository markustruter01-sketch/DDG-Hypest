// AI layer checks. LOCAL DATABASE ONLY; never calls Anthropic. Pure checks always run; the HTTP part runs when
// AI_CHECK_API points at a local API started with ANTHROPIC_API_KEY=<anything> AI_MONTHLY_BUDGET_USD=1
// ANTHROPIC_BASE_URL=http://localhost:<AI_CHECK_FAKE_PORT> (this script serves the fake Claude API on that port).
import assert from "node:assert/strict";
import { SCREENING } from "./screening";
import http from "node:http";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

const { db, usersTable, plansTable, aiUsageTable, aiLedgerDailyTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { costMicroUsd, fitsBudget } = await import("../lib/ai");
const { parseNotes } = await import("./ai-notes");
const { screenMessage, STOP_MESSAGE, WELLBEING_MESSAGE } = await import("./chat");

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- pure ----------
ok(costMicroUsd("plan", 1000, 500) === 1000 * 2 + 500 * 10, "Sonnet cost: tokens × US$/Mtok = micro-US$");
ok(costMicroUsd("quick", 1000, 500) === Math.round(1000 * 0.1 + 500 * 0.5), "Haiku cost");
ok(fitsBudget(0, 1, "quick", 4000, 300), "small call fits a $1 budget");
ok(!fitsBudget(999_000, 1, "plan", 4000, 2000), "call refused when it could pass the budget");
ok(!fitsBudget(0, 0, "quick", 10, 10), "zero budget: nothing fits");

const plan = { coachId: "rex", weeks: 1, sessions: [{ week: 1, day: 1, title: "A", items: [] }, { week: 1, day: 2, title: "B", items: [] }] };
{
  const good = parseNotes(`Sure! {"intro":"Welcome in. We build steady strength together.","notes":[{"week":1,"day":1,"note":"Own every rep today."},{"week":1,"day":2,"note":"Smooth and controlled."}]}`, plan);
  ok(good?.intro?.startsWith("Welcome") && good.notes.size === 2, "valid reply accepted, text around the JSON ignored");
  const mixed = parseNotes(JSON.stringify({ intro: "Four weeks of 3 sessions", notes: [
    { week: 1, day: 1, note: "Do 3 sets of 10" }, { week: 1, day: 2, note: "Stop if you feel sharp pain" }, { week: 9, day: 9, note: "Ghost session" },
  ] }), plan);
  ok(mixed === null, "numbers, warning words, unknown sessions: all dropped (nothing usable → null)");
  const long = parseNotes(JSON.stringify({ intro: "x".repeat(400), notes: [{ week: 1, day: 1, note: "Keep it easy and breathe." }] }), plan);
  ok(long?.intro === null && long.notes.size === 1, "too-long intro dropped, good note kept");
  ok(parseNotes("not json at all", plan) === null, "garbage → null");
  const dupes = parseNotes(JSON.stringify({ intro: "", notes: [{ week: 1, day: 1, note: "First one." }, { week: 1, day: 1, note: "Second one." }] }), plan);
  ok(dupes?.notes.get("1:1") === "First one." && dupes.notes.size === 1, "one note per session: first wins");
  ok(parseNotes(JSON.stringify({ intro: "See https://x.y", notes: [] }), plan) === null, "links dropped");
}
ok(screenMessage("how deep should I squat?").kind === "ok", "normal question → AI");
ok(screenMessage("I get chest pain on the bike").kind === "stop", "warning words → safety stop");
ok(screenMessage("I've been starving myself to lose weight").kind === "wellbeing", "wellbeing words → fixed help message");

// ---------- HTTP with a fake Claude API (optional) ----------
const api = process.env["AI_CHECK_API"];
const fakePort = Number(process.env["AI_CHECK_FAKE_PORT"] ?? 0);
if (api && fakePort) {
  const seen: { system: string; body: string }[] = [];
  const fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as { system: string | { text: string }[]; messages: { content: string }[] };
      const system = typeof body.system === "string" ? body.system : body.system.map((b) => b.text).join("\n");
      seen.push({ system, body: raw });
      let text: string;
      if (system.includes("Reply with ONLY a JSON object")) {
        const sessions = (JSON.parse(body.messages.at(-1)!.content) as { sessions: { week: number; day: number }[] }).sessions;
        text = JSON.stringify({
          intro: "Welcome to your block. We start steady and build from there.",
          notes: sessions.map((s, i) => ({ week: s.week, day: s.day, note: i === 0 ? "Do 3 sets" : "Smooth, controlled reps today." })),
        });
      } else {
        text = "Keep your core braced and breathe out as you push.";
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 900, output_tokens: 120 } }));
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
  const A = browser();
  const email = `ai-check-${Date.now()}@example.test`;
  const answers = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: ["dumbbells"], avoid_areas: ["knee"], health_accepted: true, screening: { answers: SCREENING.questions.map(() => false), cleared: false } };
  ok((await A("GET", "/config")).json.ai === true, "config: AI on");
  ok((await A("POST", "/auth/signup", { email, password: "correct horse battery", display_name: "AI Check", adult_confirmed: true })).status === 201, "signup");
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  ok((await A("PUT", "/me/training/profile", answers)).status === 200, "profile");
  ok((await A("POST", "/me/coach/messages", { text: "hi" })).status === 402, "chat needs Plans or Coaching");
  ok((await A("POST", "/dev/unlock", { kind: "tier2" })).status === 200, "tier2");

  const created = await A("POST", "/me/plans");
  ok(created.status === 201 && created.json.notes_status === "pending" && created.json.intro === null, "plan shows at once, notes pending (spec §12)");
  const built = await A("POST", `/me/plans/${created.json.id}/notes`);
  ok(built.status === 200 && built.json.intro?.startsWith("Welcome") && built.json.notes_status === "done", "plan has the coach's intro");
  ok(built.json.sessions[0].note === null && built.json.sessions[1].note === "Smooth, controlled reps today.", "note with a number dropped, others kept");
  ok(!seen.some((s) => s.body.includes(email) || s.body.includes("AI Check")), "no email or name sent to the AI");
  const [row] = await db.select({ record: plansTable.record }).from(plansTable).where(eq(plansTable.id, built.json.id));
  ok((row!.record as { ai?: { raw?: string } }).ai?.raw?.includes("Welcome"), "raw AI output stored with the plan");

  const chat1 = await A("POST", "/me/coach/messages", { text: "How should I brace on rows?" });
  ok(chat1.status === 200 && chat1.json.messages.at(-1).text.startsWith("Keep your core"), "chat reply from the AI");
  const calls = seen.length;
  const stop = await A("POST", "/me/coach/messages", { text: "I felt a sharp pain in my knee" });
  ok(stop.json.messages.at(-1).text === STOP_MESSAGE && seen.length === calls, "warning words: fixed stop reply, no AI call");
  ok((await A("GET", "/me/training")).json.plan.status === "paused", "and the plan is paused");
  const help = await A("POST", "/me/coach/messages", { text: "I keep purging after meals" });
  ok(help.json.messages.at(-1).text === WELLBEING_MESSAGE && seen.length === calls, "wellbeing words: fixed help reply, no AI call");
  const usage = await db.select().from(aiUsageTable).where(eq(aiUsageTable.userId, u!.id));
  ok(usage.length === 2 && usage.every((r) => r.ok && r.costMicroUsd > 0), "every AI call logged with its cost");

  // Daily cap
  const { dayOf } = await import("./allowance");
  const { and } = await import("drizzle-orm");
  const day = dayOf(new Date(), null);
  await db.update(aiLedgerDailyTable).set({ calls: 20 }).where(and(eq(aiLedgerDailyTable.userId, u!.id), eq(aiLedgerDailyTable.day, day), eq(aiLedgerDailyTable.kind, "chat")));
  ok((await A("POST", "/me/coach/messages", { text: "one more" })).status === 429, "daily message cap");
  await db.update(aiLedgerDailyTable).set({ calls: 1 }).where(and(eq(aiLedgerDailyTable.userId, u!.id), eq(aiLedgerDailyTable.day, day), eq(aiLedgerDailyTable.kind, "chat")));

  // Budget spent → AI stops, app carries on
  const [spent] = await db.insert(aiUsageTable).values({ purpose: "chat", model: "check", inputTokens: 0, outputTokens: 0, costMicroUsd: 1_000_000, ok: true }).returning({ id: aiUsageTable.id });
  const before = seen.length;
  ok((await A("POST", "/me/coach/messages", { text: "any tips for sleep?" })).status === 503, "budget spent: chat says try later");
  ok(seen.length === before, "and no AI call was made");
  await db.delete(aiUsageTable).where(eq(aiUsageTable.id, spent!.id));
  fake.close();
} else {
  console.log("(HTTP part skipped: set AI_CHECK_API and AI_CHECK_FAKE_PORT)");
}

console.log(`ai checks passed: ${n}`);
process.exit(0);
