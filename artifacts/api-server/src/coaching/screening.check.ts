// Health check (pre-exercise screening) checks. LOCAL DATABASE + LOCAL API ONLY. Pure checks always run; the HTTP
// part uses ACCOUNT_CHECK_API (an API started with NODE_ENV=development DEV_AUTO_LOGIN=1, payments off).
import assert from "node:assert/strict";
import { SCREENING, screeningResult } from "./screening";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };
const all = (v: boolean) => SCREENING.questions.map(() => v);
const oneYes = all(false).map((_, i) => i === 2);

// ---------- pure ----------
ok(screeningResult(undefined).ok === false, "no answers: can't start");
ok(screeningResult({ answers: all(false).slice(1), cleared: false }).ok === false, "an answer missing: can't start");
const clear = screeningResult({ answers: all(false), cleared: true });
ok(clear.ok && !clear.record.any_yes && !clear.record.cleared && clear.record.version === SCREENING.version, "all no: start; 'cleared' ignored");
const blocked = screeningResult({ answers: oneYes, cleared: false });
ok(!blocked.ok && blocked.message === SCREENING.yes_advice, "a yes without clearance: told to check with a doctor first");
const ok2 = screeningResult({ answers: oneYes, cleared: true });
ok(ok2.ok && ok2.record.any_yes && ok2.record.cleared, "a yes with clearance: start, both recorded");
ok(!JSON.stringify(ok2).includes("answers"), "single answers are not kept");

// ---------- HTTP ----------
const api = process.env["ACCOUNT_CHECK_API"];
if (api) {
  const { db, usersTable, trainingProfilesTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
  const config = await call("GET", "/config");
  ok(config.json.screening.questions.length === SCREENING.questions.length && config.json.screening.version === SCREENING.version, "/config serves the questions");
  const email = `screen-check-${Date.now()}@example.test`;
  ok((await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: "Screen", adult_confirmed: true })).status === 201, "signup");
  const base = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: [], avoid_areas: [], health_accepted: true };
  ok((await call("PUT", "/me/training/profile", base)).status === 400, "profile without the health check: refused");
  const refused = await call("PUT", "/me/training/profile", { ...base, screening: { answers: oneYes, cleared: false } });
  ok(refused.status === 400 && refused.json.message === SCREENING.yes_advice, "a yes without clearance: refused with the advice");
  ok((await call("PUT", "/me/training/profile", { ...base, screening: { answers: oneYes, cleared: true } })).status === 200, "a yes with clearance: saved");
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  const [p] = await db.select({ s: trainingProfilesTable.screening }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, u!.id));
  ok(p?.s?.any_yes === true && p.s.cleared === true && p.s.version === SCREENING.version, "result stored, not the answers");
  const exported = await call("GET", "/me/export");
  ok(exported.json.training_profile?.health_check?.cleared === true, "export includes the health check");
  ok(!("screening" in (await call("GET", "/me/training")).json.profile), "the health check is never sent back");
  // A profile saved before the health check existed must answer it before a plan.
  await db.update(trainingProfilesTable).set({ screening: null }).where(eq(trainingProfilesTable.userId, u!.id));
  await call("POST", "/dev/unlock", { kind: "intro_plan" });
  ok((await call("POST", "/me/plans")).status === 409, "old profile without the health check: no plan until answered");
  await call("PUT", "/me/training/profile", { ...base, screening: { answers: all(false), cleared: false } });
  ok((await call("POST", "/me/plans")).status === 201, "after answering: plan built");

  // Build plan 1.2: every "this hurts" is kept; a safety pause lifts only with the member's acknowledgement.
  const { painEventsTable } = await import("@workspace/db");
  const plan = (await call("GET", "/me/training")).json.plan;
  const itemId = plan.sessions[0].items[0].id as number;
  ok((await call("POST", `/me/items/${itemId}/hurts`, { text: "chest press felt great" })).json.stopped === false, "training talk: no pause");
  ok((await call("POST", `/me/items/${itemId}/hurts`, { text: "chest pain after the set" })).json.stopped === true, "chest pain: paused");
  ok((await call("POST", "/me/plans/resume")).status === 400, "resume with no body: refused");
  ok((await call("POST", "/me/plans/resume", { acknowledged: false, note: "fine" })).status === 400, "resume without acknowledgement: refused");
  ok((await call("POST", "/me/plans/resume", { acknowledged: true, note: "GP checked me, all clear" })).status === 200, "resume with acknowledgement: plan active");
  const events = await db.select().from(painEventsTable).where(eq(painEventsTable.userId, u!.id));
  ok(events.length === 2 && events.filter((e) => e.stopped).length === 1, "both reports kept, one marked as a stop");
  const stop = events.find((e) => e.stopped)!;
  ok(stop.flag === "chest" && stop.resolvedAt !== null && stop.resolvedNote === "GP checked me, all clear", "the stop is resolved with the member's note");
  ok((await call("GET", "/me/export")).json.pain_reports?.length === 2, "export includes the pain reports");
} else {
  console.log("(HTTP part skipped: set ACCOUNT_CHECK_API)");
}
console.log(`screening checks passed: ${n}`);
process.exit(0);
