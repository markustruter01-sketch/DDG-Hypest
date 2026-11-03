// Engine checks. Run from repo root: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/coaching/engine.check.ts
import assert from "node:assert/strict";
import { COACHES, EXERCISES, EXERCISE_BY_ID, EXPERIENCE, GOALS, type Area, type Equipment } from "./library";
import { buildPlan, findSwap, fits, nextLoads, targetLoadFor, WEEKS } from "./engine";
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

// Warning words
assert.equal(redFlag("sharp pain in my knee"), "sharp");
assert.equal(redFlag("my back feels tight"), null);
n += 2;

console.log(`engine: ${n} checks passed`);
