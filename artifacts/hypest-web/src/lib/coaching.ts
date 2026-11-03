import {
  getGetTrainingQueryKey,
  getListCoachesQueryKey,
  useGetTraining,
  useListCoaches,
  type Coach,
  type TrainingAnswers,
} from "@workspace/api-client-react";

import { localDayNumber } from "./time";

export const request = { credentials: "include" as const };
export const img = (name: string) => `${import.meta.env.BASE_URL}img/${name}`;

export function useTraining() {
  return useGetTraining({ query: { queryKey: getGetTrainingQueryKey(), retry: false }, request });
}

export function useCoaches() {
  return useListCoaches({ query: { queryKey: getListCoachesQueryKey(), staleTime: Infinity } });
}

export function coachById(coaches: Coach[] | undefined, id: string | undefined): Coach | undefined {
  return coaches?.find((c) => c.id === id);
}

export const GOAL_LABEL: Record<string, string> = {
  strength: "Get stronger", muscle: "Build muscle", fat_loss: "Lose fat", fitness: "Get fitter",
  mobility: "Move better", endurance: "Go longer", performance: "Perform better",
};
export const EXPERIENCE_LABEL: Record<string, string> = { beginner: "New", intermediate: "Some", advanced: "Lots" };
export const EQUIPMENT_LABEL: Record<string, string> = {
  dumbbells: "Dumbbells", kettlebell: "Kettlebell", barbell: "Barbell", machines: "Gym machines",
  bands: "Bands", pullup_bar: "Pull-up bar", cardio_machine: "Bike / rower / treadmill", pool: "Pool",
};
export const AREA_LABEL: Record<string, string> = {
  knee: "Knee", lower_back: "Lower back", shoulder: "Shoulder", wrist: "Wrist", hip: "Hip", ankle: "Ankle", neck: "Neck",
};

/** Short lines in each coach's voice for the Today screen. Original Hypest copy. */
const COACH_LINES: Record<string, string[]> = {
  mara: ["Breathe first. Everything else follows.", "Gentle is still progress.", "Show up for ten minutes. Stay if it feels good.", "Rest is part of the plan."],
  rex: ["Log it. Beat it next week.", "No zero days.", "Form first. Then weight.", "The plan works if you do."],
  jade: ["Let's make today fun.", "Sweat now, smile later.", "Move like you mean it.", "Play hard, rest harder."],
  kip: ["Easy days easy. Hard days hard.", "Consistency beats intensity.", "Every kilometre counts.", "Trust the build."],
  ace: ["Fast is a skill. Practise it.", "Win the warm-up.", "Explode, then recover.", "Small edges add up."],
  ivy: ["Control beats speed.", "Small moves, strong centre.", "Quality over quantity, every rep.", "Stand taller than yesterday."],
};
export function coachLine(coachId: string | undefined, now = new Date()): string {
  const lines = COACH_LINES[coachId ?? ""] ?? COACH_LINES.rex!;
  const day = localDayNumber(now);
  return lines.at(day % lines.length) ?? "";
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export function dose(item: { sets: number; reps: number | null; seconds: number | null }): string {
  if (item.reps !== null) return `${item.sets} × ${item.reps}`;
  const s = item.seconds ?? 0;
  const t = s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`;
  return item.sets > 1 ? `${item.sets} × ${t}` : t;
}

/** Onboarding answers kept in the browser until the account exists. */
const PENDING_KEY = "hypest_pending_answers";
export function savePendingAnswers(a: TrainingAnswers) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch { /* storage blocked: answers just aren't carried over */ }
}
export function takePendingAnswers(): TrainingAnswers | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as TrainingAnswers) : null;
  } catch {
    return null;
  }
}
