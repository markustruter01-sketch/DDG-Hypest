// Phase 3.2 (docs/TIERS-AND-BODY-SPEC.md §1, §4): Free gets week 1 of its first block; weeks 2 to 4 open with Starter and
// stay open after it lapses; events keep only whitelisted props; Free never makes an AI call.
// LOCAL DATABASE + LOCAL API ONLY: ACCOUNT_CHECK_API is an API started with NODE_ENV=development DEV_AUTO_LOGIN=1 (dev
// unlock), payments off, as check-all.sh does.
import assert from "node:assert/strict";
import { SCREENING } from "./screening";
import { cleanProps } from "./events";
import { DEFAULT_ALLOWANCES, DEFAULT_CAPS_MICRO_USD } from "./allowance";
import { PRICES } from "./access";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- pure ----------
ok(JSON.stringify(cleanProps({ tier: "tier2", email: "a@b.c", ip: "1.2.3.4", coach_id: "x".repeat(99) })) === JSON.stringify({ tier: "tier2", coach_id: "x".repeat(40) }),
  "events: only whitelisted props, strings cut to 40");
ok(Object.values(DEFAULT_ALLOWANCES.none).every((a) => a.perDay === 0 && a.perMonth === 0) && DEFAULT_CAPS_MICRO_USD.none === 0, "Free: no AI allowance, US$0 cap");
ok(PRICES.tier1_cents === 499 && PRICES.tier2_cents === 1299 && PRICES.tier3_cents === 1999, "monthly prices as the spec");
ok(PRICES.tier1_yearly_cents === 3499 && PRICES.tier2_yearly_cents === 7999 && PRICES.tier3_yearly_cents === 11999, "yearly prices as the spec");

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
const api = process.env["ACCOUNT_CHECK_API"] ?? "";
if (!api || !["127.0.0.1", "localhost"].includes(dbUrl.hostname)) {
  console.log(`tiers: ${n} passed (HTTP part skipped: set ACCOUNT_CHECK_API and a local DATABASE_URL)`);
  process.exit(0);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api)) throw new Error("refusing: ACCOUNT_CHECK_API must be a local server");

const { db, usersTable, membershipsTable, planSessionsTable, planItemsTable, plansTable, aiUsageTable, eventsTable } = await import("@workspace/db");
const { and, eq, gt } = await import("drizzle-orm");

function member() {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
}
const profile = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: ["dumbbells"], avoid_areas: [], health_accepted: true,
  screening: { answers: SCREENING.questions.map(() => false), cleared: false } };
async function signup(call: ReturnType<typeof member>, tag: string): Promise<number> {
  const email = `tiers-${tag}-${Date.now()}@example.test`;
  assert.equal((await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: tag, adult_confirmed: true })).status, 201);
  assert.equal((await call("PUT", "/me/training/profile", profile)).status, 200);
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  return u!.id;
}
const itemIn = async (planId: number, week: number) => {
  const [row] = await db.select({ item: planItemsTable.id, session: planSessionsTable.id }).from(planItemsTable)
    .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
    .where(and(eq(planSessionsTable.planId, planId), eq(planSessionsTable.week, week), eq(planSessionsTable.day, 1))).limit(1);
  return row!;
};
const set = { reps: 8, seconds: null, load_kg: 10 };

// ---------- Free: week 1 only ----------
{
  const F = member();
  const id = await signup(F, "free");
  const started = new Date();
  const built = await F("POST", "/me/plans");
  ok(built.status === 201 && built.json.access === "week1", "Free: first block built, access week1");
  ok(built.json.sessions.length === profile.days_per_week && built.json.sessions.every((s: { week: number }) => s.week === 1), "Free: only week 1 is sent");
  const planId = built.json.id as number;
  const w1 = await itemIn(planId, 1), w2 = await itemIn(planId, 2);
  ok((await F("PUT", `/me/items/${w1.item}/sets/1`, set)).status === 200, "Free: logging in week 1 works");
  ok((await F("PUT", `/me/items/${w2.item}/sets/1`, set)).status === 402, "Free: logging in week 2 is refused");
  ok((await F("POST", `/me/sessions/${w2.session}/complete`)).status === 402, "Free: completing a week-2 session is refused");
  ok((await F("POST", "/me/plans")).status === 402, "Free: a second block (after logging) is part of Starter");
  ok((await F("POST", "/me/plans/next")).status === 402, "Free: next block is part of Starter");
  ok((await F("GET", "/me/progress")).status === 200, "Free: progress is open");
  const hurt = await F("POST", `/me/items/${w1.item}/hurts`, { text: "my knee aches a bit" });
  ok(hurt.status === 200 && !/\b(starter|upgrade|tier ?[123])\b/i.test(String(hurt.json.message)), "a pain report never carries an upsell");
  ok((await F("POST", "/me/coach/messages", { text: "hi" })).status === 402, "Free: no chat");
  const calls = await db.select({ id: aiUsageTable.id }).from(aiUsageTable).where(and(eq(aiUsageTable.userId, id), gt(aiUsageTable.at, started)));
  ok(calls.length === 0, "Free: no AI calls made");
  const events = await db.select({ name: eventsTable.name }).from(eventsTable).where(eq(eventsTable.userId, id));
  ok(events.some((e) => e.name === "signup") && events.some((e) => e.name === "plan_built"), "events: signup and plan_built recorded");

  // Upgrade opens the same block.
  ok((await F("POST", "/dev/unlock", { kind: "tier1" })).status === 200, "Starter unlocked");
  const after = (await F("GET", "/me/training")).json.plan;
  ok(after.id === planId && after.access === "full" && after.sessions.some((s: { week: number }) => s.week === 4), "upgrade: the same block, all 4 weeks");
  ok((await F("PUT", `/me/items/${w2.item}/sets/1`, set)).status === 200, "upgrade: week 2 logging works");

  // A block built while paid stays open after the membership lapses.
  const next = await F("POST", "/me/plans/next");
  ok(next.status === 201 && next.json.access === "full", "Starter: next block built, full");
  await db.update(membershipsTable).set({ status: "ended", endsAt: new Date() }).where(eq(membershipsTable.userId, id));
  const lapsed = (await F("GET", "/me/training")).json;
  ok(lapsed.access.level === "none" && lapsed.plan.access === "full", "lapsed: the block built while paid stays open");
  const n2 = await itemIn(next.json.id, 2);
  ok((await F("PUT", `/me/items/${n2.item}/sets/1`, set)).status === 200, "lapsed: can still log that block's week 2");
  ok((await F("POST", "/me/plans/next")).status === 402, "lapsed: no new block");
}

// ---------- Free: changing coach before the first set replaces the block ----------
{
  const G = member();
  const id = await signup(G, "swap");
  const a = await G("POST", "/me/plans");
  await G("PUT", "/me/training/profile", { ...profile, coach_id: "jade" });
  const b = await G("POST", "/me/plans");
  ok(a.status === 201 && b.status === 201 && b.json.coach_id === "jade", "Free: an untouched block can be rebuilt for a new coach");
  const live = await db.select({ id: plansTable.id }).from(plansTable).where(and(eq(plansTable.userId, id), eq(plansTable.status, "active")));
  ok(live.length === 1, "only one active block");
}

console.log(`tiers: ${n} passed`);
process.exit(0);
