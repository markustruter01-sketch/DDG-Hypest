import { filterReply } from "./output-filter";
import type { Targets } from "./nutrition";

/**
 * The weekly meal plan's checks (docs/TIERS-AND-BODY-SPEC.md §5.4). Pure. A plan that breaks any rule is dropped
 * whole: the member sees "Your meal plan couldn't be made this time. Try again later."
 */
export type Meal = { slot: "breakfast" | "lunch" | "dinner" | "snack"; name: string; ingredients: string[]; kcal: number; protein_g: number };
export type MealDay = { day: number; meals: Meal[]; total_kcal: number; total_protein_g: number };
export type MealPlan = { days: MealDay[]; grocery: { aisle: string; items: string[] }[] };

export const MEAL_PLAN_FAILED = "Your meal plan couldn't be made this time. Try again later.";
export const FIELD_MAX = 200;
const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/** Pure: the meal filter profile. Phase 2's filter, but quantities with units are allowed in ingredient/grocery fields. */
export function mealTextOk(text: string, quantities: boolean): boolean {
  if (typeof text !== "string" || !text.trim() || text.length > FIELD_MAX) return false;
  return filterReply(text, null, FIELD_MAX, quantities ? { allowQuantities: true } : { skipPlanNumbers: true }) === null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Pure: does this text name a food to avoid (whole word or phrase, any case)? */
export function namesAvoided(text: string, avoid: string[]): boolean {
  return avoid.some((a) => a.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(a.trim())}($|[^\\p{L}\\p{N}])`, "iu").test(text));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const within = (value: number, target: number, frac: number, min = 0) => Math.abs(value - target) <= Math.max(target * frac, min);

/** Pure: the model's JSON → a checked plan, or null. */
export function checkMealPlan(raw: unknown, t: Pick<Targets, "kcal" | "proteinG" | "floorKcal" | "ceilingKcal">, avoid: string[]): MealPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { days?: unknown; grocery?: unknown };
  if (!Array.isArray(r.days) || r.days.length !== 7 || !Array.isArray(r.grocery) || r.grocery.length === 0 || r.grocery.length > 20) return null;
  const days: MealDay[] = [];
  for (const [i, d] of r.days.entries()) {
    const x = d as { meals?: unknown; total_kcal?: unknown; total_protein_g?: unknown };
    const total = num(x.total_kcal), protein = num(x.total_protein_g);
    if (total === null || protein === null || !Array.isArray(x.meals) || x.meals.length !== 4) return null;
    const meals: Meal[] = [];
    for (const [j, m] of x.meals.entries()) {
      const y = m as { name?: unknown; ingredients?: unknown; kcal?: unknown; protein_g?: unknown };
      const kcal = num(y.kcal), p = num(y.protein_g);
      if (kcal === null || p === null || typeof y.name !== "string" || !Array.isArray(y.ingredients)) return null;
      if (y.ingredients.length === 0 || y.ingredients.length > 15) return null;
      if (!mealTextOk(y.name, false) || namesAvoided(y.name, avoid)) return null;
      for (const ing of y.ingredients) if (typeof ing !== "string" || !mealTextOk(ing, true) || namesAvoided(ing, avoid)) return null;
      meals.push({ slot: SLOTS[j]!, name: y.name.trim(), ingredients: (y.ingredients as string[]).map((s) => s.trim()), kcal: Math.round(kcal), protein_g: Math.round(p) });
    }
    // The day: inside the floor and ceiling, near the targets, and its meals add up to what it says.
    if (total < t.floorKcal || total > t.ceilingKcal) return null;
    if (!within(total, t.kcal, 0.1) || !within(protein, t.proteinG, 0.15)) return null;
    const sumK = meals.reduce((a, m) => a + m.kcal, 0), sumP = meals.reduce((a, m) => a + m.protein_g, 0);
    if (!within(sumK, total, 0.05) || !within(sumP, protein, 0.05, 2)) return null;
    days.push({ day: i + 1, meals, total_kcal: Math.round(total), total_protein_g: Math.round(protein) });
  }
  const grocery: MealPlan["grocery"] = [];
  for (const g of r.grocery) {
    const x = g as { aisle?: unknown; items?: unknown };
    if (typeof x.aisle !== "string" || !mealTextOk(x.aisle, false) || !Array.isArray(x.items) || x.items.length === 0 || x.items.length > 40) return null;
    for (const it of x.items) if (typeof it !== "string" || !mealTextOk(it, true) || namesAvoided(it, avoid)) return null;
    grocery.push({ aisle: x.aisle.trim(), items: (x.items as string[]).map((s) => s.trim()) });
  }
  return { days, grocery };
}

/** Pure: the first JSON object in a reply (the model may wrap it in a sentence). */
export function jsonIn(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** What the meal-plan call is told. Only the targets, foods to avoid and units (spec §11). */
export function mealPlanPrompt(t: Pick<Targets, "kcal" | "proteinG" | "floorKcal" | "ceilingKcal">, avoid: string[], units: "kg" | "lb") {
  const system = [
    "You write a simple 7-day meal plan for a fitness app. Everyday supermarket food, easy to cook. Estimates, not medical advice.",
    "Never mention medicines, supplements, protein powder, diagnoses, links or health conditions.",
    `Each day: breakfast, lunch, dinner and one snack, in that order. Each day's total must be between ${t.floorKcal} and ${t.ceilingKcal} kcal,`,
    `within 10% of ${t.kcal} kcal, with protein within 15% of ${t.proteinG} g. The meals must add up to the day's totals.`,
    `Never use these foods: ${avoid.length ? avoid.join(", ") : "(none)"}. Quantities in ${units === "lb" ? "oz, lb, cups, tbsp, tsp or pieces" : "g, kg, ml, l, cups, tbsp, tsp or pieces"}.`,
    "Every text field under 200 characters. A grocery list grouped by aisle (at most 20 aisles).",
    'Reply with ONLY a JSON object: {"days":[{"meals":[{"name":"","ingredients":[""],"kcal":0,"protein_g":0}],"total_kcal":0,"total_protein_g":0}],"grocery":[{"aisle":"","items":[""]}]}',
  ].join("\n");
  return { system, user: "Write this week's plan." };
}
