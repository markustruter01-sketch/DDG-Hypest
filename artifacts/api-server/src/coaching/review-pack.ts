// Physiologist review pack: everything the plan engine and safety rules do, printed from the code itself
// so the reviewer sees exactly what members get. Run from repo root:
//   pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/coaching/review-pack.ts > review-pack.md
import { AREAS, COACHES, COACH_BY_ID, EXERCISES, EXERCISE_BY_ID, type Area, type Equipment, type Experience, type Goal } from "./library";
import { buildPlan, WEEKS, type PlanItem } from "./engine";

const out: string[] = [];
const say = (s = "") => out.push(s);
const list = (xs: readonly string[]) => (xs.length ? xs.join(", ") : "none");
const dose = (it: PlanItem) => {
  const what = it.reps !== null ? `${it.sets} × ${it.reps}` : it.sets > 1 ? `${it.sets} × ${it.seconds}s` : `${Math.round((it.seconds ?? 0) / 60)} min`;
  return `${what}, rest ${it.restSeconds}s`;
};

say("## Exercise list");
say(`${EXERCISES.length} exercises. "Loads" = body areas the exercise puts real load on: a member who marks that area as sore never gets it. Level: 1 = beginner, 2 = intermediate, 3 = advanced (members only get their level and below). Swaps = what "This hurts" offers, best first, if it fits the member.`);
say();
say("| Exercise | Coaches' disciplines | Pattern | Equipment (any one) | Level | Loads | Measure | Swaps | Cue shown |");
say("|---|---|---|---|---|---|---|---|---|");
for (const e of EXERCISES) {
  const swaps = e.swaps.map((id) => EXERCISE_BY_ID.get(id)?.name ?? id);
  say(`| ${e.name} | ${e.disciplines.join(", ")} | ${e.pattern} | ${list(e.equipment)} | ${e.level} | ${list(e.loads)} | ${e.measure}${e.weighted ? ", weighted" : ""} | ${list(swaps)} | ${e.cue} |`);
}
say();

say("## Coaches and their session templates");
for (const c of COACHES) {
  say(`- **${c.name}** (${c.title}): goals offered: ${c.goals.join(", ")}. Day templates (movement patterns in order; shorter sessions use the first ones): ${c.dayTemplates.map((t, i) => `Day ${String.fromCharCode(65 + i)}: ${t.join(" → ")}`).join("; ")}.`);
}
say();

type Sample = { coach: string; goal: Goal; experience: Experience; days: number; minutes: number; equipment: Equipment[]; sore: Area[] };
const samples: Sample[] = [
  { coach: "rex", goal: "strength", experience: "beginner", days: 3, minutes: 45, equipment: ["dumbbells"], sore: [] },
  { coach: "rex", goal: "muscle", experience: "intermediate", days: 4, minutes: 60, equipment: ["barbell", "dumbbells", "machines"], sore: [] },
  { coach: "rex", goal: "fat_loss", experience: "beginner", days: 3, minutes: 30, equipment: [], sore: ["knee"] },
  { coach: "rex", goal: "strength", experience: "advanced", days: 4, minutes: 60, equipment: ["barbell", "pullup_bar"], sore: ["lower_back"] },
  { coach: "mara", goal: "mobility", experience: "beginner", days: 3, minutes: 30, equipment: [], sore: [] },
  { coach: "mara", goal: "fitness", experience: "intermediate", days: 2, minutes: 45, equipment: [], sore: ["wrist"] },
  { coach: "mara", goal: "mobility", experience: "beginner", days: 4, minutes: 20, equipment: [], sore: ["knee", "lower_back"] },
  { coach: "jade", goal: "fat_loss", experience: "beginner", days: 3, minutes: 30, equipment: ["dumbbells"], sore: [] },
  { coach: "jade", goal: "fitness", experience: "intermediate", days: 4, minutes: 45, equipment: ["kettlebell", "cardio_machine"], sore: [] },
  { coach: "jade", goal: "muscle", experience: "advanced", days: 5, minutes: 60, equipment: ["dumbbells", "kettlebell", "pullup_bar"], sore: ["shoulder"] },
  { coach: "kip", goal: "endurance", experience: "beginner", days: 3, minutes: 30, equipment: [], sore: [] },
  { coach: "kip", goal: "endurance", experience: "intermediate", days: 5, minutes: 60, equipment: ["cardio_machine", "pool"], sore: [] },
  { coach: "kip", goal: "fitness", experience: "beginner", days: 2, minutes: 45, equipment: [], sore: ["ankle"] },
  { coach: "ivy", goal: "fitness", experience: "beginner", days: 3, minutes: 30, equipment: [], sore: [] },
  { coach: "ivy", goal: "mobility", experience: "intermediate", days: 3, minutes: 45, equipment: ["bands"], sore: ["neck"] },
  { coach: "ivy", goal: "fitness", experience: "advanced", days: 4, minutes: 45, equipment: [], sore: ["lower_back"] },
  { coach: "ace", goal: "performance", experience: "intermediate", days: 3, minutes: 60, equipment: ["barbell", "dumbbells"], sore: [] },
  { coach: "ace", goal: "strength", experience: "advanced", days: 4, minutes: 60, equipment: ["barbell", "machines", "pullup_bar"], sore: ["knee"] },
  { coach: "ace", goal: "fitness", experience: "beginner", days: 3, minutes: 30, equipment: [], sore: ["ankle"] },
  { coach: "ace", goal: "performance", experience: "beginner", days: 2, minutes: 45, equipment: ["cardio_machine"], sore: ["hip"] },
];

say(`## ${samples.length} sample plans`);
say(`Each plan is ${WEEKS} weeks. Week 1 is shown in full. Weeks 2 and 3 add 1 rep per week to rep-based work and 5 seconds per week to timed work done in more than one set; week 4 drops one set from everything (lighter week).`);
samples.forEach((s, i) => {
  const plan = buildPlan({ coachId: s.coach, goal: s.goal, experience: s.experience, daysPerWeek: s.days, minutes: s.minutes, equipment: s.equipment, avoidAreas: s.sore, block: 1 });
  say();
  say(`### ${i + 1}. ${COACH_BY_ID.get(s.coach)!.name}: ${s.goal}, ${s.experience}, ${s.days} days × ${s.minutes} min, equipment: ${list(s.equipment)}, sore: ${list(s.sore)}`);
  for (const sess of plan.sessions.filter((x) => x.week === 1)) {
    say(`- **Day ${sess.day}** (${sess.title}): ${sess.items.map((it) => `${EXERCISE_BY_ID.get(it.exerciseId)!.name} ${dose(it)}`).join("; ")}`);
  }
});
say();
say(`Body areas members can mark as sore: ${AREAS.join(", ")}.`);
process.stdout.write(out.join("\n") + "\n");
