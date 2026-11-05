// Onboarding draft checks (build plan 1.4). LOCAL DATABASE + LOCAL API ONLY. Uses ACCOUNT_CHECK_API
// (an API started with NODE_ENV=development DEV_AUTO_LOGIN=1, payments off), like screening.check.ts.
import assert from "node:assert/strict";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

const api = process.env["ACCOUNT_CHECK_API"];
if (api) {
  const browser = () => {
    const jar = new Map<string, string>();
    return async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
      const t = await r.text();
      return { status: r.status, json: t ? JSON.parse(t) : null, jar };
    };
  };
  const config = (await (await fetch(`${api}/config`)).json()) as { screening: { questions: unknown[] } };
  const no = config.screening.questions.map(() => false);
  const answers = { coach_id: "jade", goal: "fitness", experience: "beginner", days_per_week: 4, minutes: 30, equipment: ["kettlebell"], avoid_areas: ["knee"], health_accepted: true, screening: { answers: no, cleared: false } };
  const password = "correct horse battery";

  // A visitor finishes onboarding, then signs up (in any tab: the key is a cookie, not tab storage).
  const A = browser();
  ok((await A("PUT", "/onboarding/draft", { ...answers, coach_id: "nobody" })).status === 400, "invalid draft refused");
  ok((await A("PUT", "/onboarding/draft", { ...answers, screening: { answers: no.map((_, i) => i === 0), cleared: false } })).status === 400, "health-check yes without clearance refused, as on a profile");
  const saved = await A("PUT", "/onboarding/draft", answers);
  ok(saved.status === 204 && saved.jar.has("hypest_draft"), "draft saved under an httpOnly cookie");
  ok((await A("PUT", "/onboarding/draft", { ...answers, days_per_week: 5 })).status === 204, "changing an answer replaces the draft");
  const emailA = `draft-a-${Date.now()}@example.test`;
  const signed = await A("POST", "/auth/signup", { email: emailA, password, display_name: "Draft A", adult_confirmed: true });
  ok(signed.status === 201 && !signed.jar.has("hypest_draft"), "signup claims the draft and clears its cookie");
  const training = await A("GET", "/me/training");
  ok(training.json.profile?.coach_id === "jade" && training.json.profile.days_per_week === 5 && training.json.profile.avoid_areas.includes("knee"), "the answers became the profile");
  const freePlan = await A("POST", "/me/plans");
  ok(freePlan.status === 201 && freePlan.json.access === "week1" && freePlan.json.sessions.every((x: { week: number }) => x.week === 1), "then=plan on Free: the first block, week 1 only");
  ok(typeof freePlan.json.intro === "string" && freePlan.json.notes_status === "none", "Free: the coach's fixed intro, no AI notes");

  // Spec 3.1 §4.2: day 1 tried before signup is in the plan after signup (not after login).
  const T = browser();
  ok((await T("PUT", "/onboarding/draft/trial", { finished: false, sets: [] })).status === 409, "trial without a draft: refused");
  await T("PUT", "/onboarding/draft", answers);
  const preview = await T("POST", "/coaching/preview", answers);
  const first = preview.json.sessions[0].items[0] as { exercise_id: string; measure: string };
  const set = { position: 1, exercise_id: first.exercise_id, set_number: 1, reps: first.measure === "reps" ? 8 : null, seconds: first.measure === "time" ? 30 : null, load_kg: null };
  ok((await T("PUT", "/onboarding/draft/trial", { finished: false, sets: [{ ...set, set_number: 99 }] })).status === 400, "trial: out-of-range set refused");
  ok((await T("PUT", "/onboarding/draft/trial", { finished: true, sets: [set] })).status === 204, "trial saved with the draft");
  ok((await T("PUT", "/onboarding/draft/trial", { finished: false, sets: [set] })).status === 204, "a late save is accepted");
  ok((await T("POST", "/auth/signup", { email: `draft-t-${Date.now()}@example.test`, password, display_name: "Trial", adult_confirmed: true })).status === 201, "signup after the trial");
  const tPlan = (await T("GET", "/me/training")).json.plan;
  const day1 = tPlan?.sessions.find((x: { week: number; day: number }) => x.week === 1 && x.day === 1);
  ok(day1 && day1.items[0].logs.length === 1, "the trial set is in week 1 day 1");
  ok(day1 && day1.completed_at !== null, "a finished trial (even after a late save) marks day 1 done");


  // An existing member who onboarded while logged out: login claims it too.
  const B = browser();
  const emailB = `draft-b-${Date.now()}@example.test`;
  await B("POST", "/auth/signup", { email: emailB, password, display_name: "Draft B", adult_confirmed: true });
  await B("POST", "/auth/logout");
  await B("PUT", "/onboarding/draft", { ...answers, coach_id: "rex", goal: "strength" });
  ok((await B("POST", "/auth/login", { email: emailB, password })).status === 200, "login");
  ok((await B("GET", "/me/training")).json.profile?.coach_id === "rex", "login claims the draft");

  // A draft is used once: someone else using the same cookie later gets nothing.
  const C = browser();
  await C("PUT", "/onboarding/draft", answers);
  const stolen = [...(await C("GET", "/config")).jar].find(([k]) => k === "hypest_draft")!;
  await C("POST", "/auth/signup", { email: `draft-c-${Date.now()}@example.test`, password, display_name: "Draft C", adult_confirmed: true });
  const D = browser();
  await D("GET", "/config"); // fresh jar
  const d = await fetch(`${api}/auth/signup`, { method: "POST", headers: { "content-type": "application/json", cookie: `${stolen[0]}=${stolen[1]}` },
    body: JSON.stringify({ email: `draft-d-${Date.now()}@example.test`, password, display_name: "Draft D", adult_confirmed: true }) });
  const cookie = d.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const dTraining = await (await fetch(`${api}/me/training`, { headers: { cookie } })).json() as { profile: unknown };
  ok(d.status === 201 && dTraining.profile === null, "a claimed draft cannot be claimed again");
  // Build plan 1.11: drafts are unauthenticated writes, so each network gets 60 per 15 minutes.
  {
    const { db, authAttemptsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const ip = `198.19.${Date.now() % 250}.${Math.floor(Math.random() * 250)}`; // 198.18.0.0/15 is for testing
    const other = `198.19.251.${Math.floor(Math.random() * 250)}`;
    for (const x of [ip, other]) await db.delete(authAttemptsTable).where(eq(authAttemptsTable.ip, x));
    await db.insert(authAttemptsTable).values(Array.from({ length: 59 }, () => ({ ip, kind: "draft" })));
    const put = (from: string) => fetch(`${api}/onboarding/draft`, { method: "PUT", headers: { "content-type": "application/json", "x-forwarded-for": from }, body: JSON.stringify(answers) });
    ok((await put(ip)).status === 204, "60th draft from one network in 15 minutes: allowed");
    const blocked = await put(ip);
    ok(blocked.status === 429 && Number(blocked.headers.get("retry-after")) > 0, "61st draft from one network in 15 minutes: 429");
    ok((await put(other)).status === 204, "another network can still save a draft");
    for (const x of [ip, other]) await db.delete(authAttemptsTable).where(eq(authAttemptsTable.ip, x));
  }
} else {
  console.log("(HTTP part skipped: set ACCOUNT_CHECK_API)");
}
console.log(`draft checks passed: ${n}`);
process.exit(0);
