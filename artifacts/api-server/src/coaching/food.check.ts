// Phase 3.3 nutrition-lite (docs/TIERS-AND-BODY-SPEC.md §5, §12). LOCAL DATABASE ONLY; never calls Anthropic.
// Pure checks always run. HTTP: ACCOUNT_CHECK_API (AI off) for tiers and blocks; AI_CHECK_API with this script's fake
// Claude API on AI_CHECK_FAKE_PORT for meal logs, photos and meal plans (as ai.check.ts does).
import assert from "node:assert/strict";
import http from "node:http";
import { SCREENING } from "./screening";
import { targetsFor, weightForTargets, type TargetInput } from "./nutrition";
import { checkMealPlan, mealTextOk, namesAvoided } from "./meal-plan";
import { checkMealItems } from "./meal-log";
import { eatingFlag, screenMessage } from "./chat";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- the formula: 8 hand-worked cases ----------
const T = (i: TargetInput) => targetsFor(i);
{
  const a = T({ sex: "male", age: 30, heightCm: 180, weightKg: 80, goal: "muscle", daysPerWeek: 4 });
  // BMR 1780; TDEE 2759; ×1.10 = 3034.9; floor 1780; ceiling 3173 → 3030; protein 1.6 × 80 = 128 → 130
  ok(a.kcal === 3030 && a.floorKcal === 1780 && a.ceilingKcal === 3173 && a.proteinG === 130 && !a.maintenanceOnly, "male, muscle, 4 days");
  const b = T({ sex: "female", age: 40, heightCm: 165, weightKg: 70, goal: "fat_loss", daysPerWeek: 3 });
  // BMR 1370.25; TDEE 1884.1; ×0.85 = 1601.5 → 1600; floor ceil10(1370.25) = 1380; protein 126 → 125
  ok(b.kcal === 1600 && b.floorKcal === 1380 && b.proteinG === 125, "female, fat loss, 3 days");
  const c = T({ sex: "unsaid", age: 25, heightCm: 170, weightKg: 65, goal: "fitness", daysPerWeek: 5 });
  // BMR 1509.5 (−78); TDEE 2339.7 → 2340; floor 1510; protein 1.2 × 65 = 78 → 80
  ok(c.kcal === 2340 && c.floorKcal === 1510 && c.proteinG === 80, "not said: the midpoint constant");
  const d = T({ sex: "female", age: 60, heightCm: 150, weightKg: 45, goal: "fat_loss", daysPerWeek: 2 });
  // BMR 926.5; TDEE 1273.9; ×0.85 = 1082.9 → under the 1,200 floor → 1200
  ok(d.kcal === 1200 && d.floorKcal === 1200, "female floor of 1,200 wins over the deficit");
  const e = T({ sex: "male", age: 70, heightCm: 160, weightKg: 55, goal: "fat_loss", daysPerWeek: 3 });
  // BMR 1205; TDEE 1656.9; ×0.85 = 1408.3 → under the 1,500 floor → 1500; protein 99 → 100
  ok(e.kcal === 1500 && e.floorKcal === 1500 && e.proteinG === 100, "male floor of 1,500 wins over the deficit");
  const f = T({ sex: "female", age: 22, heightCm: 170, weightKg: 50, goal: "fat_loss", daysPerWeek: 4 });
  // BMI 17.3 → maintenance: TDEE 2001.8 → 2000, no deficit
  ok(f.maintenanceOnly && f.kcal === 2000, "BMI under 18.5: maintenance only, whatever the goal");
  const g = T({ sex: "female", age: 90, heightCm: 150, weightKg: 40, goal: "mobility", daysPerWeek: 2 });
  // Age 90. BMR 726.5; TDEE 998.9; ceiling 1149 < floor 1200 → the floor wins: 1200, ceiling shown as 1200
  ok(g.kcal === 1200 && g.floorKcal === 1200 && g.ceilingKcal === 1200 && g.maintenanceOnly && g.proteinG === 50, "floor above ceiling, age 90: the floor wins");
  const h = T({ sex: "male", age: 30, heightCm: 200, weightKg: 150, goal: "fat_loss", daysPerWeek: 6 });
  // Protein 1.8 × 150 = 270 → capped at 220; BMR 2605; TDEE 4037.75; ×0.85 = 3432.1 → 3430
  ok(h.proteinG === 220 && h.kcal === 3430 && h.floorKcal === 2610, "protein capped at 220 g");
  for (const x of [a, b, c, d, e, f, g, h]) ok(x.kcal >= x.floorKcal && x.kcal <= x.ceilingKcal, "never under the floor, never over the ceiling");
}
ok(weightForTargets(80, [79, 79.5]) === 80 && weightForTargets(80, [78, 78, 78, 78, 78, 78, 78, 99]) === 81, "the 7-day average once there are 7 weights");

// ---------- eating words and the meal filter ----------
ok(eatingFlag("honestly I've been starving myself") && screenMessage("I want to purge after dinner").kind === "wellbeing", "eating words: help message");
ok(!eatingFlag("two eggs on toast"), "a normal meal is fine");
ok(mealTextOk("1 kg rice", true) && mealTextOk("200 g chicken breast", true), "the meal filter allows quantities");
ok(!mealTextOk("creatine", true) && !mealTextOk("1 scoop whey", true) && !mealTextOk("see www.recipes.com", true), "the meal filter drops supplements and links");
ok(!mealTextOk("x".repeat(201), true), "fields over 200 characters dropped");
ok(namesAvoided("Peanut butter toast", ["peanut"]) && !namesAvoided("Peanuts", ["peanut"]) && namesAvoided("Pine nuts", ["pine nuts"]), "foods to avoid: whole words, any case");

const targets = { kcal: 2000, proteinG: 120, floorKcal: 1400, ceilingKcal: 2400 };
const day = (kcal = 2000, protein = 120, mealsKcal = [500, 600, 700, 200]) => ({
  meals: mealsKcal.map((k, i) => ({ name: ["Oats", "Chicken wrap", "Salmon and rice", "Yoghurt"][i], ingredients: ["100 g oats", "1 cup milk"], kcal: k, protein_g: protein / 4 })),
  total_kcal: kcal, total_protein_g: protein,
});
const plan = (days = Array.from({ length: 7 }, () => day())) => ({ days, grocery: [{ aisle: "Dairy", items: ["1 l milk"] }] });
ok(checkMealPlan(plan(), targets, [])?.days.length === 7, "a good plan is kept");
ok(checkMealPlan(plan([...Array.from({ length: 6 }, () => day()), day(1300, 120, [300, 400, 400, 200])]), { ...targets, kcal: 1350 }, []) === null, "a day under the floor drops the plan");
ok(checkMealPlan(plan([...Array.from({ length: 6 }, () => day()), day(2000, 120, [500, 500, 500, 200])]), targets, []) === null, "meals that don't add up drop the plan");
ok(checkMealPlan(plan(), targets, ["oats"]) === null, "a food to avoid drops the plan");
ok(checkMealPlan(plan([...Array.from({ length: 6 }, () => day()), day(2300, 120, [600, 700, 800, 200])]), targets, []) === null, "a day more than 10% off target drops the plan");
ok(checkMealPlan({ ...plan(), days: plan().days.slice(0, 6) }, targets, []) === null, "six days: dropped");
ok(checkMealItems({ items: [{ name: "2 eggs", kcal: 140, protein_g: 12 }] })?.length === 1, "a meal estimate is kept");
ok(checkMealItems({ items: [{ name: "pizza", kcal: 3000, protein_g: 40 }] }) === null, "an item over 2,500 kcal drops the estimate");
ok(checkMealItems({ items: Array.from({ length: 13 }, () => ({ name: "x", kcal: 1, protein_g: 0 })) }) === null, "more than 12 items: dropped");

// ---------- HTTP ----------
const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
const local = ["127.0.0.1", "localhost"].includes(dbUrl.hostname);
const account = process.env["ACCOUNT_CHECK_API"] ?? "";
const aiApi = process.env["AI_CHECK_API"] ?? "";
const fakePort = Number(process.env["AI_CHECK_FAKE_PORT"] ?? 0);
if (!local || !account) {
  console.log(`food: ${n} passed (HTTP part skipped)`);
  process.exit(0);
}
const { db, usersTable, mealLogsTable, mealPlansTable, aiUsageTable } = await import("@workspace/db");
const { eq, sql } = await import("drizzle-orm");

function member(api: string) {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
}
const no = SCREENING.questions.map(() => false);
const profile = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 4, minutes: 45, equipment: ["dumbbells"], avoid_areas: [], health_accepted: true, screening: { answers: no, cleared: false } };
const setup = { sex: "male", birth_year: new Date().getUTCFullYear() - 30, height_cm: 180, weight_kg: 80, foods_to_avoid: ["peanut"], pregnant: false };
async function join(call: ReturnType<typeof member>, tag: string, kind?: string): Promise<number> {
  const email = `food-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  assert.equal((await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: tag, adult_confirmed: true })).status, 201);
  assert.equal((await call("PUT", "/me/training/profile", profile)).status, 200);
  if (kind) assert.equal((await call("POST", "/dev/unlock", { kind })).status, 200);
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  return u!.id;
}
const blocked = async (id: number) => (await db.select({ b: usersTable.nutritionBlocked }).from(usersTable).where(eq(usersTable.id, id)))[0]!.b;

{
  const F = member(account);
  await join(F, "free");
  const s = await F("GET", "/me/food");
  ok(s.status === 200 && !s.json.available && s.json.targets === null, "Free: no food features");
  ok((await F("PUT", "/me/food/setup", setup)).status === 402, "Free: set-up is part of Starter");

  const S = member(account);
  await join(S, "starter", "tier1");
  const saved = await S("PUT", "/me/food/setup", setup);
  ok(saved.status === 200 && saved.json.targets?.kcal === 3030 && saved.json.targets.protein_g === 130, "Starter: targets from the formula (case 1)");
  ok(!saved.json.can_use_ai && (await S("POST", "/me/food/meal-plan")).status === 402 && (await S("POST", "/me/food/meals", { text: "toast" })).status === 402, "Starter: no meal plans or meal logging");
  ok(saved.json.setup.foods_to_avoid[0] === "peanut", "foods to avoid kept");

  // Blocks: eating words, pregnancy, the health check (even after re-answering).
  const E = member(account);
  const eId = await join(E, "eat", "tier1");
  const help = await E("PUT", "/me/food/setup", { ...setup, foods_to_avoid: ["starving myself"] });
  ok(help.status === 200 && help.json.blocked && typeof help.json.notice === "string" && help.json.targets === null, "eating words in foods to avoid: help message and the block");
  ok(await blocked(eId) && (await E("PUT", "/me/food/setup", setup)).status === 403, "blocked: set-up refused for good");
  ok((await E("GET", "/me/food")).json.targets === null, "blocked: no targets shown");

  const P = member(account);
  const pId = await join(P, "preg", "tier1");
  const preg = await P("PUT", "/me/food/setup", { ...setup, pregnant: true });
  ok(preg.status === 200 && preg.json.blocked && await blocked(pId), "pregnant or breastfeeding: blocked");

  const H = member(account);
  const hId = await join(H, "health", "tier1");
  await H("PUT", "/me/training/profile", { ...profile, screening: { answers: no.map((_, i) => i === 0), cleared: true } });
  await H("PUT", "/me/training/profile", profile);
  ok(await blocked(hId) && (await H("PUT", "/me/food/setup", setup)).status === 403, "a health-check yes blocks, even after re-answering no");

  const Y = member(account);
  const yId = await join(Y, "young", "tier1");
  await Y("PUT", "/me/food/setup", { ...setup, birth_year: new Date().getUTCFullYear() - 16 });
  ok(await blocked(yId), "under 18 from the birth year: blocked");
  ok((await Y("PUT", "/me/food/setup", { ...setup, birth_year: 1900 })).status === 403, "still blocked");

  const C = member(account);
  const cId = await join(C, "chat", "tier2");
  await C("POST", "/me/coach/messages", { text: "I keep making myself sick, I mean I make myself sick after meals" });
  ok(await blocked(cId), "eating words in chat block nutrition");

  const M = member(account);
  const mId = await join(M, "meal", "tier2");
  ok((await M("POST", "/me/food/meals", { text: "toast" })).status === 409, "meal log before set-up: 409");
  await M("PUT", "/me/food/setup", setup);
  const meal = await M("POST", "/me/food/meals", { text: "I'm not eating today, just water" });
  ok(meal.status === 200 && typeof meal.json.notice === "string" && meal.json.blocked && await blocked(mId), "eating words in a meal sentence: help message and the block");
}

// ---------- with the fake Claude API: meal logs, a photo, meal plans ----------
if (aiApi && fakePort) {
  let planMode: "good" | "bad" = "good";
  const seen: string[] = [];
  const fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push(raw.length > 200 ? `${raw.length} bytes` : raw);
      const body = JSON.parse(raw) as { system: string };
      let text: string;
      if (body.system.includes("7-day meal plan")) {
        const kcal = Number(/within 10% of (\d+) kcal/.exec(body.system)![1]);
        const protein = Number(/protein within 15% of (\d+) g/.exec(body.system)![1]);
        const k = Math.round(kcal / 4), p = Math.round(protein / 4);
        const d = { meals: ["Oats with milk", "Chicken wrap", "Beef and rice", "Yoghurt and fruit"].map((name) => ({ name, ingredients: ["100 g oats"], kcal: k, protein_g: p })), total_kcal: k * 4, total_protein_g: p * 4 };
        text = JSON.stringify({ days: Array.from({ length: 7 }, () => (planMode === "bad" ? { ...d, total_kcal: 500 } : d)), grocery: [{ aisle: "Pantry", items: ["1 kg oats"] }] });
      } else {
        text = JSON.stringify({ items: [{ name: "2 eggs", kcal: 140, protein_g: 12 }, { name: "1 slice toast", kcal: 90, protein_g: 3 }], note: "free text is dropped" });
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 200, output_tokens: 300 } }));
    });
  });
  await new Promise<void>((r) => fake.listen(fakePort, r));

  const A = member(aiApi);
  const aId = await join(A, "ai", "tier2");
  await A("PUT", "/me/food/setup", setup);
  const logged = await A("POST", "/me/food/meals", { text: "two eggs on toast" });
  ok(logged.status === 200 && logged.json.today.kcal === 230 && logged.json.today.protein_g === 15 && logged.json.today.meals[0].items.length === 2, "meal sentence: estimated and totalled");
  ok(!JSON.stringify(logged.json).includes("free text"), "free text in the estimate is dropped");

  const photo = Buffer.from("fake-jpeg-bytes-" + "x".repeat(5000)).toString("base64");
  const p = await A("POST", "/me/food/meals/photo", { media_type: "image/jpeg", data: photo });
  ok(p.status === 200 && p.json.today.meals.at(-1).text === "photo", "meal photo: estimated, logged as 'photo'");
  const rows = await db.select().from(mealLogsTable).where(eq(mealLogsTable.userId, aId));
  const usage = await db.select().from(aiUsageTable).where(eq(aiUsageTable.userId, aId));
  ok(!JSON.stringify(rows).includes(photo.slice(0, 40)) && !JSON.stringify(usage).includes(photo.slice(0, 40)), "the photo is never stored");
  ok((await A("POST", "/me/food/meals/photo", { media_type: "image/gif", data: photo })).status === 400, "only jpeg, png or webp");

  const mealId = rows[0]!.id;
  const edited = await A("PATCH", `/me/food/meals/${mealId}`, { items: [{ name: "3 eggs", kcal: 210, protein_g: 18 }] });
  ok(edited.status === 200 && edited.json.today.meals.find((m: { id: number }) => m.id === mealId).kcal === 210, "a logged meal can be edited");
  ok((await A("DELETE", `/me/food/meals/${mealId}`)).status === 200, "and deleted");

  const first = await A("POST", "/me/food/meal-plan");
  ok(first.status === 200 && first.json.meal_plan?.days.length === 7 && first.json.meal_plans_left === 1, "meal plan made; one rebuild left this week");
  planMode = "bad";
  const failed = await A("POST", "/me/food/meal-plan");
  ok(failed.status === 502 && /couldn't be made/.test(failed.json.message), "a plan that breaks the checks is dropped");
  planMode = "good";
  ok((await A("POST", "/me/food/meal-plan")).status === 429, "Coaching: 2 meal plans a week (the failed one counts)");
  const kept = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(mealPlansTable).where(eq(mealPlansTable.userId, aId));
  ok(kept[0]!.n === 2 && (await A("GET", "/me/food")).json.meal_plan.days.length === 7, "the good plan still shows");
  fake.close();
}

console.log(`food: ${n} passed`);
process.exit(0);
