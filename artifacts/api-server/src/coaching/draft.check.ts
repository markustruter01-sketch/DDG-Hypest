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
  ok((await A("POST", "/me/plans")).status === 402, "then=plan with nothing bought: Today shows the offer card");

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
} else {
  console.log("(HTTP part skipped: set ACCOUNT_CHECK_API)");
}
console.log(`draft checks passed: ${n}`);
process.exit(0);
