// Plate maths checks (build plan 1.5). Pure. Run from repo root:
// pnpm --filter @workspace/scripts exec tsx ../artifacts/hypest-web/src/lib/plates.check.ts
import assert from "node:assert/strict";
import { platesFor, platesText } from "./plates";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n += 1; };

eq(platesFor(20, "kg"), null, "empty bar: no plates");
eq(platesFor(60, "kg")?.perSide, [20], "60 kg = 20 a side");
eq(platesFor(102.5, "kg")?.perSide, [25, 15, 1.25], "102.5 kg");
eq(platesFor(142.5, "kg")?.perSide, [25, 25, 10, 1.25], "142.5 kg");
const odd = platesFor(61, "kg")!;
eq([odd.exact, odd.loaded], [false, 60], "61 kg can't be made: nearest lower is 60");
eq(platesFor(135, "lb")?.perSide, [45], "135 lb = a plate a side");
eq(platesFor(225, "lb")?.perSide, [45, 45], "225 lb = two plates a side");
eq(platesFor(185, "lb")?.perSide, [45, 25], "185 lb");
eq(platesText(platesFor(102.5, "kg")!, "kg"), "25 + 15 + 1.25 a side", "text");
eq(platesText(odd, "kg"), "20 a side (60 kg: nearest you can load)", "text when not exact");

console.log(`plates: ${n} checks passed`);
