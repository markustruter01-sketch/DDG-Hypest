/**
 * Warning words in "this hurts" feedback and coach chat. Any match pauses the plan and tells the
 * member to stop and see a doctor or physio. Applies on EVERY tier. DRAFT list for physiologist review.
 *
 * Matching (build plan 1.2): whole words only, each word with its declared forms ("pop" matches
 * "popped" but not "popular"), and exercise names are removed first, so "chest press felt great"
 * does not stop a plan while "chest pain after chest press" still does.
 */
import { EXERCISES } from "./library";

/** Each entry: the word reported as the match, and its accepted forms. The forms are exactly the words the
 *  old substring list caught (e.g. "tingl" caught "tingling"), minus the false positives ("popular",
 *  "sharpen"). No new symptom words: additions are the physiologist's and Fable's call. */
const RED_FLAGS: { word: string; forms: string }[] = [
  { word: "sharp", forms: "sharp" },
  { word: "stabbing", forms: "stabbing" },
  { word: "numb", forms: "numb|numbness|numbing|numbed" },
  { word: "tingl", forms: "tingle|tingles|tingled|tingling|tingly" },
  { word: "pins and needles", forms: "pins and needles" },
  { word: "chest", forms: "chest" },
  { word: "heart", forms: "heart|heartbeat|heartburn" },
  { word: "faint", forms: "faint|fainted|fainting|faintness" },
  { word: "dizzy", forms: "dizzy" },
  { word: "short of breath", forms: "short of breath" },
  { word: "can't breathe", forms: "can't breathe" },
  { word: "cannot breathe", forms: "cannot breathe" },
  { word: "swollen", forms: "swollen" },
  { word: "swelling", forms: "swelling" },
  { word: "pop", forms: "pop|pops|popped|popping" },
  { word: "can't bear weight", forms: "can't bear weight" },
  { word: "cannot bear weight", forms: "cannot bear weight" },
  { word: "blood", forms: "blood|bloody|bloodied" },
  { word: "vision", forms: "vision" },
  { word: "headache", forms: "headache|headaches" },
];

/** Gym phrases that contain a warning word but describe training, not a symptom (exercise names from the
 *  library are added automatically). Only multi-word phrases: a bare symptom word is never excused. */
const GYM_PHRASES = ["chest press", "chest fly", "chest flies", "chest day", "chest workout", "chest stretch", "heart rate"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALLOWED = [...new Set([...EXERCISES.map((e) => e.name.toLowerCase()), ...GYM_PHRASES])]
  .filter((p) => p.includes(" "))
  .sort((a, b) => b.length - a.length);
const ALLOWED_RE = new RegExp(`\\b(?:${ALLOWED.map(escape).join("|")})\\b`, "g");
const FLAG_RES = RED_FLAGS.map((f) => ({ word: f.word, re: new RegExp(`(?<![a-z'])(?:${f.forms.split("|").map(escape).join("|")})(?![a-z])`) }));

export function redFlag(text: string): string | null {
  const t = text.toLowerCase().replace(/[’`]/g, "'").replace(ALLOWED_RE, " ");
  return FLAG_RES.find((f) => f.re.test(t))?.word ?? null;
}

export const STOP_MESSAGE =
  "Stop training and get this checked by a doctor or physiotherapist before you continue. Your plan is paused. If it is severe or sudden, call 000.";
