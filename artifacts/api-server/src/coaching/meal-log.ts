import { mealTextOk } from "./meal-plan";

/**
 * Meal logging (docs/TIERS-AND-BODY-SPEC.md §5.5). Pure checks on the model's estimate: at most 12 items, each at most
 * 2,500 kcal and 200 g of protein, names through the meal filter. Only the items are kept; any free text is dropped.
 */
export type MealItem = { name: string; kcal: number; protein_g: number };
export const MAX_ITEMS = 12;
export const ITEM_KCAL_MAX = 2500;
export const ITEM_PROTEIN_MAX = 200;
export const NAME_MAX = 80;
export const MEAL_LOG_FAILED = "Couldn't estimate that meal this time. You can type the foods instead, or try again later.";
/** Photos: the decoded size the API accepts (the app shrinks photos well below this). */
export const PHOTO_MAX_BYTES = 3_000_000;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function checkMealItems(raw: unknown): MealItem[] | null {
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ITEMS) return null;
  const items: MealItem[] = [];
  for (const it of list) {
    const x = it as { name?: unknown; kcal?: unknown; protein_g?: unknown };
    if (typeof x.name !== "string" || x.name.length > NAME_MAX || !mealTextOk(x.name, true)) return null;
    if (typeof x.kcal !== "number" || !Number.isFinite(x.kcal) || x.kcal < 0 || x.kcal > ITEM_KCAL_MAX) return null;
    if (typeof x.protein_g !== "number" || !Number.isFinite(x.protein_g) || x.protein_g < 0 || x.protein_g > ITEM_PROTEIN_MAX) return null;
    items.push({ name: x.name.trim(), kcal: Math.round(x.kcal), protein_g: Math.round(x.protein_g) });
  }
  return items;
}

export const totalsOf = (items: MealItem[]) => ({
  kcal: items.reduce((a, i) => a + i.kcal, 0),
  protein_g: items.reduce((a, i) => a + i.protein_g, 0),
});

export const MEAL_LOG_SYSTEM = [
  "You estimate the calories and protein in a meal for a fitness app. Estimates, not medical advice.",
  "List each food with a short name (a quantity is fine), its kcal and its protein in grams. At most 12 items.",
  "Never mention medicines, supplements, diagnoses, links or health conditions. If there is no food, reply {\"items\":[]}.",
  'Reply with ONLY a JSON object: {"items":[{"name":"","kcal":0,"protein_g":0}]}',
].join("\n");
