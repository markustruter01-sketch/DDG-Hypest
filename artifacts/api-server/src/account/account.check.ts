// Account safety checks. LOCAL DATABASE + LOCAL API ONLY. Run from repo root, with the API started with
// NODE_ENV=development DEV_AUTO_LOGIN=1 (dev unlock) and NO Stripe keys (payments off):
//   DATABASE_URL=postgresql://...@127.0.0.1:5432/<db> ACCOUNT_CHECK_API=http://localhost:8099/api \
//   pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/account/account.check.ts
import assert from "node:assert/strict";
import { SCREENING } from "../coaching/screening";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);
const api = process.env["ACCOUNT_CHECK_API"] ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api)) throw new Error("refusing: ACCOUNT_CHECK_API must be a local server");

const { db, usersTable, plansTable, trainingProfilesTable, membershipsTable, sessionsTable, authFailuresTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { deleteAccount } = await import("./delete");

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

/** A logged-in browser: keeps its own cookies. */
function browser() {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, v] = pair!.split("=");
      if (v) jar.set(k!, v); else jar.delete(k!);
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };
}

const email = `account-check-${Date.now()}@example.test`;
const password = "correct horse battery";
const A = browser();
const answers = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: ["dumbbells"], avoid_areas: [], health_accepted: true, screening: { answers: SCREENING.questions.map(() => false), cleared: false } };

// ---------- headers ----------
{
  const r = await A("GET", "/healthz");
  ok(r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("x-frame-options") === "DENY", "security headers");
  ok(r.headers.get("access-control-allow-origin") === null, "no open CORS");
  ok(r.headers.get("x-powered-by") === null, "no x-powered-by");
  ok(r.headers.get("cache-control") === "no-store", "API responses not cached");
}

// ---------- set up a member with a plan and a logged set ----------
ok((await A("POST", "/auth/signup", { email, password, display_name: "Account Check", adult_confirmed: true })).status === 201, "signup");
const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
const userId = user!.id;
ok((await A("PUT", "/me/training/profile", answers)).status === 200, "profile saved");
ok((await A("POST", "/dev/unlock", { kind: "tier2" })).status === 200, "tier2 (dev unlock)");
const plan = await A("POST", "/me/plans");
ok(plan.status === 201, "plan built");
const itemId = plan.json.sessions[0].items[0].id as number;
const firstItem = plan.json.sessions[0].items[0];
const logBody = firstItem.reps !== null ? { reps: 8, seconds: null, load_kg: 20 } : { reps: null, seconds: 30, load_kg: null };
ok((await A("PUT", `/me/items/${itemId}/sets/1`, logBody)).status === 200, "set logged");

// ---------- export ----------
{
  const r = await A("GET", "/me/export");
  ok(r.status === 200 && /attachment/.test(r.headers.get("content-disposition") ?? ""), "export downloads");
  ok(r.json.account.email === email && r.json.training_profile.coach_id === "rex", "export: account + answers");
  ok(r.json.plans.length === 1 && r.json.plans[0].sessions[0].items[0].logs.length === 1, "export: plan with the logged set");
  ok(r.json.memberships.some((m: { kind: string }) => m.kind === "tier2"), "export: memberships");
  ok(!JSON.stringify(r.json).includes("password"), "export: no password hash");
  const B = browser();
  ok((await B("GET", "/me/export")).status === 401 || (await B("GET", "/auth/me")).json?.email !== email, "export: only your own data");
}

// ---------- log out everywhere ----------
{
  const B = browser();
  ok((await B("POST", "/auth/login", { email, password })).status === 200, "second device logs in");
  ok((await A("POST", "/auth/logout-all")).status === 204, "log out everywhere");
  const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));
  ok(rows.length === 0, "no sessions left");
  ok((await B("GET", "/auth/me")).json?.email !== email, "second device logged out");
  ok((await A("POST", "/auth/login", { email, password })).status === 200, "log back in");
}

// ---------- login limit lives in the database ----------
{
  const C = browser();
  for (let i = 0; i < 10; i++) await C("POST", "/auth/login", { email, password: "wrong" });
  ok((await C("POST", "/auth/login", { email, password })).status === 429, "11th try blocked, even with the right password");
  const rows = await db.select().from(authFailuresTable).where(eq(authFailuresTable.email, email));
  ok(rows.length === 10, "failures stored in the database");
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, email));
  ok((await C("POST", "/auth/login", { email, password })).status === 200, "login works again after the window");
}

// ---------- delete: refused paths change nothing ----------
{
  ok((await A("DELETE", "/auth/me", { password: "wrong" })).status === 403, "wrong password refused");
  await db.insert(membershipsTable).values({ userId, kind: "tier1", status: "active", test: true, stripeRef: `sub_check_${userId}` });
  const r = await A("DELETE", "/auth/me", { password });
  ok(r.status === 503, "payments off + live subscription: refused");
  const [p] = await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId));
  ok(Boolean(p), "refused: nothing deleted");
  await db.delete(membershipsTable).where(eq(membershipsTable.stripeRef, `sub_check_${userId}`));
}

// ---------- delete: works ----------
{
  ok((await A("DELETE", "/auth/me", { password })).status === 204, "account deleted");
  ok((await A("GET", "/auth/me")).json?.email !== email, "logged out after delete");
  ok((await browser()("POST", "/auth/login", { email, password })).status === 401, "can't log in any more");
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  ok(u!.email === `deleted-${userId}@deleted.invalid` && u!.displayName === "Deleted member" && u!.bio === null, "account row has no personal details");
  ok((await db.select().from(plansTable).where(eq(plansTable.userId, userId))).length === 0, "plans gone");
  ok((await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId))).length === 0, "answers gone");
  const ms = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
  ok(ms.length > 0 && ms.every((m) => m.status === "ended"), "membership records kept, all ended");
}

// ---------- delete with a subscription: Stripe cancel runs first ----------
{
  const [u] = await db.insert(usersTable).values({ email: `account-sub-${Date.now()}@example.test`, passwordHash: "x", displayName: "Sub check", adultConfirmedAt: new Date() }).returning({ id: usersTable.id });
  const id = u!.id;
  await db.insert(membershipsTable).values({ userId: id, kind: "tier2", status: "active", test: true, stripeRef: `sub_cancel_${id}` });
  await db.insert(trainingProfilesTable).values({ userId: id, coachId: "rex", goal: "muscle", experience: "beginner", daysPerWeek: 3, minutes: 45, equipment: [], avoidAreas: [], healthAcceptedAt: new Date() });
  await assert.rejects(deleteAccount(id, async () => { throw new Error("stripe down"); }));
  ok((await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, id))).length === 1, "cancel failed: nothing deleted");
  const cancelled: string[] = [];
  await deleteAccount(id, async (sub) => void cancelled.push(sub));
  ok(cancelled.length === 1 && cancelled[0] === `sub_cancel_${id}`, "subscription cancelled at Stripe");
  ok((await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, id))).length === 0, "then deleted");
}

console.log(`account checks passed: ${n}`);
process.exit(0);
