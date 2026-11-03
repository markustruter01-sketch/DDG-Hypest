// Build plan 1.9: one member can never touch another member's plan, and one-off plan credits are used up exactly once.
// LOCAL DATABASE + LOCAL API ONLY: ACCOUNT_CHECK_API is an API started with NODE_ENV=development DEV_AUTO_LOGIN=1 (dev unlock),
// payments off, as check-all.sh does.
import assert from "node:assert/strict";
import { SCREENING } from "./screening";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);
const api = process.env["ACCOUNT_CHECK_API"] ?? "";
if (!api) {
  console.log("ownership checks skipped: set ACCOUNT_CHECK_API");
  process.exit(0);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api)) throw new Error("refusing: ACCOUNT_CHECK_API must be a local server");

const { db, usersTable, membershipsTable, planSessionsTable, setLogsTable, painEventsTable, plansTable } = await import("@workspace/db");
const { and, eq, isNull } = await import("drizzle-orm");

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

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
  const email = `own-${tag}-${Date.now()}@example.test`;
  assert.equal((await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: tag, adult_confirmed: true })).status, 201);
  assert.equal((await call("PUT", "/me/training/profile", profile)).status, 200);
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  return u!.id;
}

// ---------- cross-user: B goes after A's sessions and items ----------
{
  const A = member(), B = member();
  const aId = await signup(A, "a");
  await signup(B, "b");
  for (const call of [A, B]) {
    await call("POST", "/dev/unlock", { kind: "tier2" });
    assert.equal((await call("POST", "/me/plans")).status, 201);
  }
  const aPlan = (await A("GET", "/me/training")).json.plan;
  const aSession = aPlan.sessions[0].id as number;
  const aItem = aPlan.sessions[0].items[0].id as number;
  const bPlan = (await B("GET", "/me/training")).json.plan;
  ok(bPlan.id !== aPlan.id, "two members, two plans");

  ok((await B("PUT", `/me/items/${aItem}/sets/1`, { reps: 5, seconds: null, load_kg: 50 })).status === 404, "B cannot log a set on A's item");
  ok((await B("POST", `/me/items/${aItem}/hurts`, { text: "chest pain" })).status === 404, "B cannot report pain on A's item");
  ok((await B("POST", `/me/sessions/${aSession}/complete`)).status === 404, "B cannot complete A's session");
  ok((await B("PUT", `/me/items/999999999/sets/1`, { reps: 5, seconds: null, load_kg: 10 })).status === 404, "an item that doesn't exist: 404, same answer");
  ok((await B("POST", `/me/sessions/999999999/complete`)).status === 404, "a session that doesn't exist: 404, same answer");

  const logs = await db.select().from(setLogsTable).where(eq(setLogsTable.itemId, aItem));
  ok(logs.length === 0, "A's item has no set logged");
  const [s] = await db.select({ done: planSessionsTable.completedAt }).from(planSessionsTable).where(eq(planSessionsTable.id, aSession));
  ok(s?.done === null, "A's session is not completed");
  ok((await db.select().from(painEventsTable).where(eq(painEventsTable.itemId, aItem))).length === 0, "no pain report on A's item");
  const [p] = await db.select({ status: plansTable.status }).from(plansTable).where(eq(plansTable.userId, aId));
  ok(p?.status === "active", "A's plan was not paused");

  // A's own requests still work.
  ok((await A("PUT", `/me/items/${aItem}/sets/1`, { reps: 5, seconds: null, load_kg: 20 })).status === 200, "A logs their own set");
  ok((await A("POST", `/me/sessions/${aSession}/complete`)).status === 200, "A completes their own session");
  ok((await B("GET", "/me/training")).json.plan.id === bPlan.id, "B still sees only their own plan");
}

// ---------- credits: /me/plans/next uses one one-off plan, once ----------
{
  const C = member();
  const cId = await signup(C, "c");
  const unused = () => db.select({ id: membershipsTable.id }).from(membershipsTable)
    .where(and(eq(membershipsTable.userId, cId), isNull(membershipsTable.usedAt)));
  await C("POST", "/dev/unlock", { kind: "intro_plan" });
  ok((await unused()).length === 1, "one credit to start");
  ok((await C("POST", "/me/plans")).status === 201, "first plan built");
  ok((await unused()).length === 0, "first plan used the intro credit");
  ok((await C("POST", "/me/plans/next")).status === 402, "next plan without a credit: 402");
  const before = (await C("GET", "/me/training")).json.plan.id;
  ok((await C("GET", "/me/training")).json.plan.id === before, "a refused next plan changes nothing");

  await C("POST", "/dev/unlock", { kind: "plan" });
  ok((await unused()).length === 1, "bought one more plan");
  const next = await C("POST", "/me/plans/next");
  ok(next.status === 201 && next.json.id !== before, "next plan built with the credit");
  ok((await unused()).length === 0, "the credit is used up");
  const used = await db.select({ usedAt: membershipsTable.usedAt }).from(membershipsTable).where(eq(membershipsTable.userId, cId));
  ok(used.length === 2 && used.every((m) => m.usedAt !== null), "both one-off plans are marked used");
  ok((await C("POST", "/me/plans/next")).status === 402, "and cannot be used twice");

  // A member (Tier 1/2) gets the next block without spending anything.
  await C("POST", "/dev/unlock", { kind: "tier1" });
  ok((await C("POST", "/me/plans/next")).status === 201, "member: next plan included");
  const [tier] = await db.select({ usedAt: membershipsTable.usedAt }).from(membershipsTable)
    .where(and(eq(membershipsTable.userId, cId), eq(membershipsTable.kind, "tier1")));
  ok(tier?.usedAt === null, "a membership is never marked used");
}

console.log(`ownership: ${n} passed`);
process.exit(0);
