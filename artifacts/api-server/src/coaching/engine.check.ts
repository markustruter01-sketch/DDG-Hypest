// Engine checks. Run from repo root: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/coaching/engine.check.ts
import assert from "node:assert/strict";
import { COACHES, EXERCISES, EXERCISE_BY_ID, EXPERIENCE, GOALS, type Area, type Equipment } from "./library";
import { buildPlan, findSwap, fits, nextLoads, WEEKS } from "./engine";
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

// Warning words
assert.equal(redFlag("sharp pain in my knee"), "sharp");
assert.equal(redFlag("my back feels tight"), null);
n += 2;

console.log(`engine: ${n} checks passed`);
