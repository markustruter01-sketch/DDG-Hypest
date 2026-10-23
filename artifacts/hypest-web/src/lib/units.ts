import { useTraining } from "@/lib/coaching";

/** Loads are stored in kg everywhere; lb is only how they are shown and typed. */
export type Units = "kg" | "lb";

const LB_PER_KG = 2.2046226218;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** First guess before the member picks: pounds for US English browsers, kilograms for everyone else. */
export function defaultUnits(): Units {
  try {
    return /^en-US\b/i.test(navigator.language) ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

export function useUnits(): Units {
  const training = useTraining();
  const saved = training.data?.profile?.units;
  return saved === "kg" || saved === "lb" ? saved : defaultUnits();
}

/** A logged load, in the member's units. */
export const shownLoad = (kg: number, u: Units) => (u === "kg" ? roundTo(kg, 0.5) : roundTo(kg * LB_PER_KG, 0.5));
/** A coach's target, rounded to a weight a gym actually has (2.5 kg or 2.5 lb steps). */
export const targetLoad = (kg: number, u: Units) => (u === "kg" ? roundTo(kg, 2.5) : roundTo(kg * LB_PER_KG, 2.5));
/** What the member entered, back to kg for storage. */
export const toKg = (value: number, u: Units) => (u === "kg" ? value : Math.round((value / LB_PER_KG) * 100) / 100);
/** One tap of + or − on the weight. */
export const loadStep = (u: Units) => (u === "kg" ? 2.5 : 5);
