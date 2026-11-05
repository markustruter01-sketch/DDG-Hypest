// Phase 3.4 (docs/TIERS-AND-BODY-SPEC.md §6, §7, §7b, §12): the readiness rule, low-day views, body metrics, the
// upgrade note, Pro's mid-week check-in and monthly report. LOCAL DATABASE ONLY. HTTP part: ACCOUNT_CHECK_API (AI off).
import assert from "node:assert/strict";
import { SCREENING } from "./screening";
import { lighterLoad, lighterSets, LOW_DAY_UPSELL, lowDayReason } from "./readiness";
import { movingAverage } from "./body";
import { isMidweekTime, MIDWEEK_NOTHING, REPORT_NOTHING, reportFacts, reportMonth } from "./coach-jobs";
import { planNumbers, type Block } from "./block";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- the readiness rule: 8 cases ----------
const c = (sleepH: number, energy: number, soreness: number) => ({ sleepHalfHours: sleepH * 2, energy, soreness });
ok(lowDayReason(c(5.5, 3, 4))?.includes("short sleep"), "1. under 6 h and soreness 4: low");
ok(lowDayReason(c(5.5, 3, 3)) === null, "2. under 6 h but soreness 3: not low");
ok(lowDayReason(c(6, 3, 5)) === null, "3. exactly 6 h, very sore, energy 3: not low");
ok(lowDayReason(c(8, 1, 4))?.includes("low energy"), "4. energy 1 and soreness 4: low");
ok(lowDayReason(c(8, 2, 5)) === null, "5. energy 2, soreness 5, slept well: not low");
ok(lowDayReason(c(0, 5, 4)) !== null, "6. no sleep at all, sore: low");
ok(lowDayReason(c(8, 1, 1)) === null, "7. energy 1 but not sore: not low");
ok(lowDayReason(null) === null, "8. no check-in: nothing changes");
ok(lighterSets(4) === 3 && lighterSets(1) === 1, "one fewer set, at least 1");
ok(lighterLoad(42.5) === 38 && lighterLoad(20) === 18 && lighterLoad(null) === null, "10% lighter, rounded down to 0.5 kg");
{
  const item = { id: 1, exerciseId: "x", name: "X", sets: 4, reps: 8, seconds: null, restSeconds: 90, targetLoadKg: 50 };
  const b = { sessions: [{ id: 1, week: 1, day: 1, title: "A", done: false, items: [item] }] } as unknown as Block;
  const low = planNumbers(b, true), normal = planNumbers(b);
  ok(low.sets.includes(3) && low.loadsKg.includes(45) && !normal.sets.includes(3), "the filter allows the lighter numbers on a low day only");
}
ok(JSON.stringify(movingAverage([{ day: "2026-01-01", weightKg: 80 }, { day: "2026-01-02", weightKg: null }, { day: "2026-01-03", weightKg: 82 }, { day: "2026-01-10", weightKg: 90 }]))
  === JSON.stringify([{ day: "2026-01-01", weight_kg: 80 }, { day: "2026-01-03", weight_kg: 81 }, { day: "2026-01-10", weight_kg: 90 }]), "7-day moving average, days without a weight skipped");

// ---------- the Pro schedule ----------
ok(isMidweekTime(new Date("2026-11-04T18:30:00Z"), "Etc/UTC") && !isMidweekTime(new Date("2026-11-04T17:30:00Z"), "Etc/UTC") && !isMidweekTime(new Date("2026-11-05T19:00:00Z"), "Etc/UTC"), "mid-week: Wednesday from 18:00 local");
ok(reportMonth(new Date("2026-12-01T09:00:00Z"), "Etc/UTC") === "2026-11" && reportMonth(new Date("2026-12-01T07:00:00Z"), "Etc/UTC") === null && reportMonth(new Date("2026-12-02T09:00:00Z"), "Etc/UTC") === null, "monthly report: the 1st from 08:00, for the month before");
ok(reportMonth(new Date("2027-01-01T09:00:00Z"), "Etc/UTC") === "2026-12", "January's report covers December");
{
  const facts = reportFacts({ sessions: 12, bests: [{ name: "Squat", kg: 100, reps: 5 }], weightChangeKg: -1.2, waistChangeCm: null, mealDays: 0, avgKcal: null });
  ok(facts.includes("-1.2 kg") && facts.includes("Squat 100 kg") && !/weigh(s|ed)? \d/.test(facts) && !facts.includes("waist"), "report facts: weight only as a change");
}

// ---------- HTTP ----------
const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
const api = process.env["ACCOUNT_CHECK_API"] ?? "";
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || !api) {
  console.log(`body: ${n} passed (HTTP part skipped)`);
  process.exit(0);
}
const { db, usersTable, planItemsTable, planSessionsTable, coachMessagesTable, monthlyReportsTable, midweekChecksTable, bodyMetricsTable } = await import("@workspace/db");
const { and, asc, eq } = await import("drizzle-orm");
const { runMidweekChecks, runMonthlyReports } = await import("./coach-jobs");

function member() {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const ck of r.headers.getSetCookie()) { const [k, v] = ck.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
}
const profile = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: ["dumbbells"], avoid_areas: [], health_accepted: true,
  screening: { answers: SCREENING.questions.map(() => false), cleared: false } };
async function join(call: ReturnType<typeof member>, tag: string, kind?: string): Promise<number> {
  const email = `body-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  assert.equal((await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: tag, adult_confirmed: true })).status, 201);
  assert.equal((await call("PUT", "/me/training/profile", profile)).status, 200);
  if (kind) assert.equal((await call("POST", "/dev/unlock", { kind })).status, 200);
  assert.equal((await call("POST", "/me/plans")).status, 201);
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  return u!.id;
}
const LOW = { sleep_half_hours: 9, energy: 3, soreness: 4 };

// One weight a day: a second entry replaces the first.
{
  const B = member();
  const id = await join(B, "weigh");
  ok((await B("PUT", "/me/body", { weight_kg: 80 })).status === 200, "weight saved");
  const second = await B("PUT", "/me/body", { weight_kg: 79.5, waist_cm: 85 });
  const rows = await db.select().from(bodyMetricsTable).where(eq(bodyMetricsTable.userId, id));
  ok(second.status === 200 && rows.length === 1 && rows[0]!.weightKg === 79.5 && rows[0]!.waistCm === 85, "one row per day: the second entry replaces the first");
  ok((await B("PUT", "/me/body", { weight_kg: 20 })).status === 400 && (await B("PUT", "/me/body", {})).status === 400, "out of range or empty: refused");
}

// Coaching on a low day: unstarted sessions lighter in the view, the stored plan unchanged, started sessions unchanged.
{
  const C = member();
  const id = await join(C, "coach", "tier2");
  const before = (await C("GET", "/me/training")).json.plan;
  const [s1, s2] = before.sessions as { id: number; items: { id: number; sets: number; target_load_kg: number | null }[] }[];
  ok((await C("PUT", `/me/items/${s1!.items[0]!.id}/sets/1`, { reps: 8, seconds: null, load_kg: 10 })).status === 200, "day 1 started before the check-in");
  const saved = await C("PUT", "/me/checkin", LOW);
  ok(saved.status === 200 && saved.json.low_day?.includes("Lighter today") && saved.json.upgrade_note === null, "check-in saved: a low day, no upgrade note on Coaching");
  ok((await C("PUT", "/me/checkin", { ...LOW, soreness: 9 })).status === 400, "check-in values are checked");
  const after = (await C("GET", "/me/training")).json.plan;
  const a1 = after.sessions.find((s: { id: number }) => s.id === s1!.id), a2 = after.sessions.find((s: { id: number }) => s.id === s2!.id);
  ok(a1.low_day === null && a1.items[0].sets === s1!.items[0]!.sets, "a session already started stays as it is");
  ok(a2.low_day !== null && a2.items.every((it: { sets: number }, i: number) => it.sets === Math.max(1, s2!.items[i]!.sets - 1)), "an unstarted session: one fewer set");
  const stored = await db.select({ sets: planItemsTable.sets }).from(planItemsTable).where(eq(planItemsTable.sessionId, s2!.id)).orderBy(asc(planItemsTable.position));
  ok(stored.every((r, i) => r.sets === s2!.items[i]!.sets), "the stored plan never changes");
  await C("PUT", `/me/items/${s2!.items[0]!.id}/sets/1`, { reps: 8, seconds: null, load_kg: 10 });
  const [mark2] = await db.select({ low: planSessionsTable.lowDay }).from(planSessionsTable).where(eq(planSessionsTable.id, s2!.id));
  const [mark1] = await db.select({ low: planSessionsTable.lowDay }).from(planSessionsTable).where(eq(planSessionsTable.id, s1!.id));
  ok(mark2?.low === true && mark1?.low === false, "the first set on a low day marks that session (not one started earlier)");
  ok((await C("GET", "/me/training")).json.plan.sessions.find((s: { id: number }) => s.id === s2!.id).low_day !== null, "a started low-day session keeps its lighter view");
  void id;
}

// Starter on a low day: the plan is unchanged and a one-line note shows; never on a day with a pain report.
{
  const S = member();
  await join(S, "starter", "tier1");
  const s = await S("PUT", "/me/checkin", LOW);
  ok(s.json.low_day === null && s.json.upgrade_note === LOW_DAY_UPSELL, "Starter: no lighter day, the one-line note");
  const plan = (await S("GET", "/me/training")).json.plan;
  ok(plan.sessions.every((x: { low_day: string | null }) => x.low_day === null), "Starter: nothing lighter");
  await S("POST", `/me/items/${plan.sessions[0].items[0].id}/hurts`, { text: "my knee aches a bit" });
  ok((await S("GET", "/me/body")).json.upgrade_note === null, "after a pain report: no upgrade note that day");
}

// Pro: the mid-week check-in (Wednesday evening, Pro only) and the monthly report (once a month, kept).
{
  const P = member(), K = member();
  const pro = await join(P, "pro", "tier3");
  const coaching = await join(K, "k", "tier2");
  await db.update(usersTable).set({ timezone: "Etc/UTC" }).where(eq(usersTable.id, pro));
  await db.update(usersTable).set({ timezone: "Etc/UTC" }).where(eq(usersTable.id, coaching));
  const wed = new Date("2026-11-04T19:00:00Z");
  await runMidweekChecks(wed, { userIds: [pro, coaching] });
  const pc = await db.select().from(midweekChecksTable).where(eq(midweekChecksTable.userId, pro));
  const kc = await db.select().from(midweekChecksTable).where(eq(midweekChecksTable.userId, coaching));
  ok(pc.length === 1 && kc.length === 0, "mid-week check-in: Pro only");
  const msg = await db.select({ text: coachMessagesTable.text }).from(coachMessagesTable).where(and(eq(coachMessagesTable.userId, pro), eq(coachMessagesTable.source, "midweek_check")));
  ok(pc[0]!.status === "skipped" && msg.length === 1 && msg[0]!.text === MIDWEEK_NOTHING, "no sessions this week: the short fixed line, no model turn");
  await runMidweekChecks(new Date("2026-11-04T21:00:00Z"), { userIds: [pro] });
  ok((await db.select().from(midweekChecksTable).where(eq(midweekChecksTable.userId, pro))).length === 1, "once per week");
  ok((await runMidweekChecks(new Date("2026-11-05T19:00:00Z"), { userIds: [pro] })).done === 0, "not on Thursday");

  await runMonthlyReports(new Date("2026-12-01T09:00:00Z"), { userIds: [pro, coaching] });
  await runMonthlyReports(new Date("2026-12-01T10:00:00Z"), { userIds: [pro, coaching] });
  const reports = await db.select().from(monthlyReportsTable).where(eq(monthlyReportsTable.userId, pro));
  ok(reports.length === 1 && reports[0]!.month === "2026-11" && reports[0]!.text === REPORT_NOTHING, "monthly report: once a month, fixed line when nothing was done");
  ok((await db.select().from(monthlyReportsTable).where(eq(monthlyReportsTable.userId, coaching))).length === 0, "monthly report: Pro only");
}

console.log(`body: ${n} passed`);
process.exit(0);
