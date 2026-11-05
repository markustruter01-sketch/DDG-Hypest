// Phase 3.3b: Journey milestones from a made-up 3-year history (docs/TIERS-AND-BODY-SPEC.md §8, §12). Pure.
import assert from "node:assert/strict";
import { journeyFrom, type JourneyLog } from "./journey";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// Three sessions a week from Mon 5 Jan 2026 for 3 years, with a 4-week break in year 2 (weeks 60 to 63).
const start = Date.UTC(2026, 0, 5); // a Monday
const DAY = 86_400_000;
const sessions: Date[] = [];
const logs: JourneyLog[] = [];
for (let w = 0; w < 156; w += 1) {
  if (w >= 60 && w < 64) continue;
  for (const d of [0, 2, 4]) {
    const at = new Date(start + (w * 7 + d) * DAY + 18 * 3_600_000);
    sessions.push(at);
    // Squat: 40 kg at the start, +1 kg a fortnight, best 110 kg; one low day (lighter) never hides the best.
    const squat = Math.min(110, 40 + Math.floor(w / 2));
    logs.push({ exerciseId: "back_squat", loadKg: w === 150 && d === 0 ? squat - 10 : squat, reps: 5, at });
    if (d === 2) logs.push({ exerciseId: "bench_press", loadKg: 30 + Math.floor(w / 4), reps: 8, at });
    if (d === 4) logs.push({ exerciseId: "plank", loadKg: null, reps: null, at });
  }
}
const now = new Date(start + 156 * 7 * DAY);
const j = journeyFrom(logs, sessions, 37, now);

ok(j.sessions_done === 456 && j.first_session_on === "2026-01-05", "456 sessions from 5 Jan 2026");
ok(j.blocks_finished === 37, "blocks finished passed through");
ok(j.longest_week_streak === 92, "longest weekly streak: the 92 weeks after the break");
ok(JSON.stringify(j.session_milestones.map((m) => m.count)) === JSON.stringify([10, 25, 50, 100, 250]), "milestones 10 to 250 reached");
ok(j.session_milestones[0]!.reached_on === "2026-01-26" && j.next_milestone === 500, "10th session on Mon 26 Jan; next milestone 500");
const squat = j.lifts.find((l) => l.exercise_id === "back_squat")!;
ok(squat.first_kg === 40 && squat.first_on === "2026-01-05", "squat: before (first logged weight)");
ok(squat.best_kg === 110 && squat.best_on === "2028-09-11", "squat: best, on the day it was first reached");
ok(squat.now_kg === 110, "squat: now (best of the last 4 weeks)");
const bench = j.lifts.find((l) => l.exercise_id === "bench_press")!;
ok(bench.first_kg === 30 && bench.best_kg === 68 && bench.best_reps === 8, "bench: before 30 kg, best 68 kg × 8");
ok(!j.lifts.some((l) => l.exercise_id === "plank"), "unweighted exercises aren't lifts");
ok(j.lifts[0]!.exercise_id === "back_squat", "main lifts: most sets first");

const empty = journeyFrom([], [], 0, now);
ok(empty.sessions_done === 0 && empty.first_session_on === null && empty.longest_week_streak === 0 && empty.next_milestone === 10 && empty.lifts.length === 0, "a new member: an empty journey");

console.log(`journey: ${n} passed`);
