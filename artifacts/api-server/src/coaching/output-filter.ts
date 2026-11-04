import { redFlag } from "./safety";
import { DIAGNOSIS_WORDS, MEDICINES, OUTPUT_CUES, OUTPUT_ONLY_FLAGS, wordsRe } from "./health-words";

/**
 * The output filter (docs/COACH-AGENT-SPEC.md §6.5). Every agent reply, memory text and change note passes this
 * before a member sees it or it is stored. Pure. Returns the rule that fired, or null when the text may be shown.
 */
export const REPLY_MAX = 600;

/** The training numbers a reply may mention: what the member's current block actually says (after any tool ran). */
export type PlanNumbers = { sets: number[]; reps: number[]; seconds: number[]; loadsKg: number[] };

export type FilterRule = "length" | "link" | "warning_word" | "encourages_pain" | "dose" | "medicine" | "diagnosis" | "plan_number" | "empty";

const MEDICINE_RE = wordsRe(MEDICINES);
const DIAGNOSIS_RE = wordsRe(DIAGNOSIS_WORDS);
const PAIN_RE = wordsRe(OUTPUT_ONLY_FLAGS);
const CUES_RE = new RegExp(wordsRe(OUTPUT_CUES).source, "gi");
const DOSE_RE = /\d[\d,.]*\s*(?:k?cals?\b|calories\b|kilojoules\b|kj\b|mg\b|mcg\b|µg\b|ml\b|iu\b|g of\b|grams? of\b)/i;
const LINK_RE = /https?:|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|au|co|app)\b/i;

const near = (a: number, b: number) => Math.abs(a - b) < 0.26;
const LB_PER_KG = 2.2046226218;

/** Pure: the first rule this text breaks, or null. */
export function filterReply(text: string, plan: PlanNumbers | null, max = REPLY_MAX): FilterRule | null {
  const t = text.replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "empty";
  if (t.length > max) return "length";
  if (LINK_RE.test(t)) return "link";
  if (redFlag(t.replace(CUES_RE, " "))) return "warning_word";
  if (PAIN_RE.test(t)) return "encourages_pain";
  if (DOSE_RE.test(t)) return "dose";
  if (MEDICINE_RE.test(t)) return "medicine";
  if (DIAGNOSIS_RE.test(t)) return "diagnosis";
  if (!trainingNumbersMatch(t, plan)) return "plan_number";
  return null;
}

/** Spec §6.5: a number with kg, lb, %, reps, sets, seconds or × must be in the plan. Plain numbers are fine. */
export function trainingNumbersMatch(t: string, plan: PlanNumbers | null): boolean {
  const num = "(\\d+(?:\\.\\d+)?)";
  const p = plan ?? { sets: [], reps: [], seconds: [], loadsKg: [] };
  const inList = (n: number, list: number[]) => list.some((x) => near(x, n));
  // "3x8", "3 × 8", "3 sets of 8"
  for (const m of t.matchAll(new RegExp(`${num}\\s*(?:x|×|sets? of)\\s*${num}`, "gi"))) {
    if (!inList(Number(m[1]), p.sets) || !(inList(Number(m[2]), p.reps) || inList(Number(m[2]), p.seconds))) return false;
  }
  if (new RegExp(`${num}\\s*(?:%|percent)`, "i").test(t)) return false;
  const checks: [RegExp, (n: number) => boolean][] = [
    [new RegExp(`${num}\\s*(?:kg|kgs|kilos?)\\b`, "gi"), (n) => inList(n, p.loadsKg)],
    [new RegExp(`${num}\\s*(?:lb|lbs|pounds?)\\b`, "gi"), (n) => p.loadsKg.some((kg) => Math.abs(kg * LB_PER_KG - n) <= 2.5)],
    [new RegExp(`${num}\\s*(?:reps?|repetitions?)\\b`, "gi"), (n) => inList(n, p.reps)],
    [new RegExp(`${num}\\s*sets?\\b`, "gi"), (n) => inList(n, p.sets)],
    [new RegExp(`${num}\\s*(?:s|sec|secs|seconds?)\\b`, "gi"), (n) => inList(n, p.seconds)],
  ];
  for (const [re, ok] of checks) for (const m of t.matchAll(re)) if (!ok(Number(m[1]))) return false;
  return true;
}
