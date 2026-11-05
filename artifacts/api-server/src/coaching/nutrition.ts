import type { Goal } from "./library";

/**
 * Nutrition targets (docs/TIERS-AND-BODY-SPEC.md §5.3). Pure, no AI. Estimates, not medical advice.
 * The floor always wins: calories never go under it, whatever the goal or the ceiling.
 */
export type Sex = "female" | "male" | "unsaid";
export type TargetInput = { sex: Sex; age: number; heightCm: number; weightKg: number; goal: Goal; daysPerWeek: number };
export type Targets = { kcal: number; proteinG: number; floorKcal: number; ceilingKcal: number; maintenanceOnly: boolean; bmr: number; tdee: number };

export const AGE_MIN = 18;
export const AGE_MAX = 90;
export const SEX_CONSTANT: Record<Sex, number> = { male: 5, female: -161, unsaid: -78 };
const MIN_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, unsaid: 1200 };
const PROTEIN_PER_KG: Partial<Record<Goal, number>> = { strength: 1.6, muscle: 1.6, fat_loss: 1.8 };
export const PROTEIN_MAX_PER_KG = 2.2;
export const PROTEIN_MAX_G = 220;
export const BMI_LOW = 18.5;

export const NUTRITION_DISCLAIMER = "Estimates, not medical advice.";
export const BLOCKED_LINE = "For eating advice, please see a doctor or dietitian.";
export const LOW_BMI_LINE = "Your coach keeps food at maintenance; talk to a doctor if your weight keeps dropping.";
export const ALLERGY_LINE = "This isn't allergy-safe: always check ingredients yourself.";

export const ageFrom = (birthYear: number, now = new Date()) => now.getUTCFullYear() - birthYear;
export const activityFor = (daysPerWeek: number) => (daysPerWeek >= 4 ? 1.55 : 1.375);
export const bmiOf = (kg: number, cm: number) => kg / (cm / 100) ** 2;
const round10 = (n: number) => Math.round(n / 10) * 10;
const ceil10 = (n: number) => Math.ceil(n / 10) * 10;

/** Mifflin–St Jeor. */
export const bmrOf = (i: Pick<TargetInput, "sex" | "age" | "heightCm" | "weightKg">) =>
  10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_CONSTANT[i.sex];

export function targetsFor(i: TargetInput): Targets {
  const bmr = bmrOf(i);
  const tdee = bmr * activityFor(i.daysPerWeek);
  const maintenanceOnly = bmiOf(i.weightKg, i.heightCm) < BMI_LOW;
  const byGoal = maintenanceOnly ? tdee : i.goal === "fat_loss" ? tdee * 0.85 : i.goal === "muscle" ? tdee * 1.1 : tdee;
  const floorKcal = Math.max(ceil10(bmr), MIN_FLOOR[i.sex]);
  const ceilingKcal = Math.round(tdee * 1.15);
  const clamped = Math.min(Math.max(byGoal, floorKcal), Math.max(floorKcal, ceilingKcal));
  const kcal = Math.max(floorKcal, round10(clamped));
  const rate = Math.min(PROTEIN_PER_KG[i.goal] ?? 1.2, PROTEIN_MAX_PER_KG);
  const proteinG = Math.round(Math.min(rate * i.weightKg, PROTEIN_MAX_G) / 5) * 5;
  return { kcal, proteinG, floorKcal, ceilingKcal: Math.max(floorKcal, ceilingKcal), maintenanceOnly, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

/** The weight the targets use: the average of the last 7 daily weights once there are 7, else the set-up weight. */
export function weightForTargets(setupKg: number, recentDailyKg: number[]): number {
  if (recentDailyKg.length < 7) return setupKg;
  const last = recentDailyKg.slice(-7);
  return Math.round((last.reduce((a, b) => a + b, 0) / 7) * 10) / 10;
}
