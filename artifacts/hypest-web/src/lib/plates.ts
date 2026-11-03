/**
 * Plate maths for the player (build plan 1.5): which plates go on EACH side of the bar for a total load.
 * Pure (no imports), so it is checked by lib/plates.check.ts under check-all.sh.
 */
export type PlateUnits = "kg" | "lb";

/** Standard bars and plate sets. A member's own gym may differ; these are the defaults the plan declares. */
export const BAR: Record<PlateUnits, number> = { kg: 20, lb: 45 };
export const PLATES: Record<PlateUnits, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export type PlateLoad = { perSide: number[]; bar: number; loaded: number; exact: boolean };

/** Greedy from the heaviest plate; `exact` is false when the total can't be made (the nearest lower load is shown). */
export function platesFor(total: number, units: PlateUnits, bar = BAR[units], plates = PLATES[units]): PlateLoad | null {
  if (!(total > bar)) return null;
  let side = (total - bar) / 2;
  const perSide: number[] = [];
  for (const p of plates) {
    while (side + 1e-9 >= p) {
      perSide.push(p);
      side -= p;
    }
  }
  const loaded = bar + 2 * perSide.reduce((a, b) => a + b, 0);
  return { perSide, bar, loaded: Math.round(loaded * 100) / 100, exact: Math.abs(loaded - total) < 1e-6 };
}

/** "20 + 10 + 2.5 a side" */
export function platesText(p: PlateLoad, units: PlateUnits): string {
  const plates = p.perSide.length ? `${p.perSide.join(" + ")} a side` : "empty bar";
  return p.exact ? plates : `${plates} (${p.loaded} ${units}: nearest you can load)`;
}
