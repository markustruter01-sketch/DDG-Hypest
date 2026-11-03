// Engine checks. Run from repo root: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/coaching/engine.check.ts
import assert from "node:assert/strict";
import { COACHES, EXERCISES, EXERCISE_BY_ID, EXPERIENCE, GOALS, type Area, type Equipment } from "./library";
import { buildPlan, findSwap, fits, nextLoads, targetLoadFor, validatePlan, WEEKS, type Plan } from "./engine";
import { redFlag } from "./safety";

let n = 0;
// Library integrity
for (const e of EXERCISES) for (const s of e.swaps) assert.ok(EXERCISE_BY_ID.has(s), `${e.id} swap ${s} missing`);
assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length, "duplicate exercise ids");
n += 2;

// Every coach × goal × experience × days × minutes, with and without kit, with sore areas, builds a valid plan
const kits: Equipment[][] = [[], ["dumbbells"], ["dumbbells", "barbell", "machines", "bands", "pullup_bar", "cardio_machine", "kettlebell", "pool"]];
const sore: Area[][] = [[], ["knee"], ["lower_back", "shoulder"]];
for (const c of COACHES) for (const goal of c.goals) for (const experience of EXPERIENCE) for (const daysPerWeek of [2, 3, 5]) for (const minutes of [20, 45, 60]) for (const equipment of kits) for (const avoidAreas of sore) {
  const plan = buildPlan({ coachId: c.id, goal, experience, daysPerWeek, minutes, equipment, avoidAreas, block: 1 });
  assert.equal(plan.sessions.length, daysPerWeek * WEEKS);
  for (const s of plan.sessions) for (const it of s.items) {
    const ex = EXERCISE_BY_ID.get(it.exerciseId)!;
    assert.ok(!ex.loads.some((a) => avoidAreas.includes(a)), `${ex.id} loads an avoided area`);
    // Steady cardio is the main work only for the endurance coach; a short warm-up for everyone else.
    if (ex.pattern === "cardio" && c.discipline !== "endurance") assert.ok((it.seconds ?? 0) <= Math.max(5, Math.round(minutes * 0.2)) * 60, `${c.id} cardio ${it.seconds}s too long`);
  }
  n += 1;
}
assert.ok(GOALS.length > 0);

// Squats hurt my back -> swap avoids lower back
const squat = EXERCISE_BY_ID.get("back_squat")!;
const swap = findSwap(squat, { equipment: ["barbell", "dumbbells"], avoidAreas: ["lower_back"], experience: "intermediate" }, COACHES.find((c) => c.id === "rex")!);
assert.ok(swap && !swap.loads.includes("lower_back"), "back-safe swap");
assert.ok(fits(swap!, { equipment: ["barbell", "dumbbells"], avoidAreas: ["lower_back"], experience: "intermediate" }));
n += 2;

// Progression: all reps hit -> +5% rounded to 0.5 kg; missed -> same
assert.deepEqual(nextLoads([{ exerciseId: "goblet_squat", targetReps: 10, reps: 10, loadKg: 20 }]), { goblet_squat: 21 });
assert.deepEqual(nextLoads([{ exerciseId: "goblet_squat", targetReps: 10, reps: 8, loadKg: 20 }]), { goblet_squat: 20 });
n += 2;

// Build plan 1.1: loads logged in block 1 reach block 2 (exercise choice rotates between blocks)
for (const c of COACHES.filter((x) => ["rex", "jade", "ace"].includes(x.id))) {
  const base = { coachId: c.id, goal: c.goals[0], experience: "intermediate" as const, daysPerWeek: 3, minutes: 45,
    equipment: ["dumbbells", "barbell", "machines", "kettlebell"] as Equipment[], avoidAreas: [] as Area[] };
  const b1 = buildPlan({ ...base, block: 1 });
  const weighted = [...new Set(b1.sessions.flatMap((s) => s.items).map((i) => i.exerciseId))]
    .filter((id) => EXERCISE_BY_ID.get(id)!.weighted).slice(0, 3);
  if (weighted.length === 0) continue;
  const loads = Object.fromEntries(weighted.map((id, i) => [id, 20 + 10 * i]));
  const b2 = buildPlan({ ...base, block: 2, targetLoads: loads });
  const b2Items = b2.sessions.flatMap((s) => s.items);
  for (const id of weighted) {
    const it = b2Items.find((i) => i.exerciseId === id);
    assert.ok(it, `${c.id}: ${id} logged in block 1 is missing from block 2`);
    assert.equal(it!.targetLoadKg, loads[id], `${c.id}: ${id} target load not carried`);
  }
  n += 1;
}
// A rotated-in exercise inherits a load only from a load-compatible swap (same pattern, same kit)
assert.equal(targetLoadFor(EXERCISE_BY_ID.get("goblet_squat")!, { back_squat: 100 }), null, "barbell load must not reach a goblet squat");
assert.equal(targetLoadFor(EXERCISE_BY_ID.get("leg_extension")!, { leg_press: 80 }), 80, "machine to machine swap carries");
assert.equal(targetLoadFor(EXERCISE_BY_ID.get("bodyweight_squat")!, { bodyweight_squat: 10 }), null, "unweighted never gets a load");
n += 3;

// Build plan 1.9: 4- and 6-day weeks and 30-minute sessions, for every coach, goal and level
for (const c of COACHES) for (const goal of c.goals) for (const experience of EXPERIENCE) for (const [daysPerWeek, minutes] of [[4, 30], [4, 60], [6, 30], [6, 45], [3, 30]] as const) for (const equipment of [kits[0]!, kits[2]!]) {
  const input = { coachId: c.id, goal, experience, daysPerWeek, minutes, equipment, avoidAreas: [] as Area[], block: 1 };
  const plan = buildPlan(input);
  assert.equal(plan.sessions.length, daysPerWeek * WEEKS, `${c.id} ${daysPerWeek} days: session count`);
  assert.deepEqual(validatePlan(plan, input), [], `${c.id} ${daysPerWeek}d ${minutes}min: valid`);
  for (let week = 1; week <= WEEKS; week += 1) {
    const days = plan.sessions.filter((s) => s.week === week).map((s) => s.day);
    assert.deepEqual(days, Array.from({ length: daysPerWeek }, (_, i) => i + 1), `${c.id} week ${week} has days 1..${daysPerWeek}`);
  }
  const longest = Math.max(...plan.sessions.map((s) => s.items.length));
  const at60 = buildPlan({ ...input, minutes: 60 });
  assert.ok(longest <= Math.max(...at60.sessions.map((s) => s.items.length)), `${c.id}: ${minutes} min is never longer than 60`);
  n += 1;
}

// validatePlan refuses bad plans (every plan, from rules or AI, passes this before a member sees it)
{
  const input = { coachId: "rex", goal: COACHES.find((c) => c.id === "rex")!.goals[0]!, experience: "beginner" as const, daysPerWeek: 3, minutes: 45,
    equipment: ["dumbbells"] as Equipment[], avoidAreas: ["knee"] as Area[], block: 1 };
  const good = buildPlan(input);
  assert.deepEqual(validatePlan(good, input), []);
  const bad = (change: (p: Plan) => void, why: RegExp, msg: string) => {
    const p: Plan = structuredClone(good);
    change(p);
    const problems = validatePlan(p, input);
    assert.ok(problems.some((x) => why.test(x)), `${msg}: got ${JSON.stringify(problems)}`);
    n += 1;
  };
  bad((p) => { p.sessions.pop(); }, /wrong number of sessions/, "a missing session");
  bad((p) => { p.sessions[0]!.items = []; }, /is empty/, "an empty day");
  bad((p) => { p.sessions[0]!.items[0]!.exerciseId = "made_up"; }, /unknown exercise/, "an unknown exercise");
  const barbellOnly = EXERCISES.find((e) => e.equipment.length > 0 && e.equipment.every((q) => q === "barbell"))!;
  bad((p) => { p.sessions[0]!.items[0]!.exerciseId = barbellOnly.id; }, /does not fit/, "kit the member doesn't have");
  const kneeLoader = EXERCISES.find((e) => e.loads.includes("knee") && e.equipment.length === 0)!;
  bad((p) => { p.sessions[0]!.items[0]!.exerciseId = kneeLoader.id; }, /does not fit/, "an exercise that loads an area to avoid");
  bad((p) => { p.sessions[0]!.items[0]!.sets = 0; }, /sets out of range/, "zero sets");
  bad((p) => { p.sessions[0]!.items[0]!.sets = 9; }, /sets out of range/, "nine sets");
  bad((p) => { const it = p.sessions[0]!.items[0]!; it.reps = null; it.seconds = null; }, /needs reps or time/, "neither reps nor time");
  bad((p) => { const it = p.sessions[0]!.items[0]!; it.reps = 10; it.seconds = 30; }, /needs reps or time/, "both reps and time");
  bad((p) => { const it = p.sessions[0]!.items.find((i) => i.reps !== null)!; it.reps = 31; }, /reps out of range/, "31 reps");
  bad((p) => { const it = p.sessions[0]!.items[0]!; it.reps = null; it.seconds = 5; }, /time out of range/, "5 seconds");
  bad((p) => { p.sessions[0]!.items[0]!.restSeconds = 301; }, /rest out of range/, "rest over 5 minutes");
}

// Warning words
assert.equal(redFlag("sharp pain in my knee"), "sharp");
assert.equal(redFlag("my back feels tight"), null);
n += 2;

console.log(`engine: ${n} checks passed`);
