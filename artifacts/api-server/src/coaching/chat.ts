import { redFlag, STOP_MESSAGE } from "./safety";

/**
 * Coach chat (Plans and Coaching; the agent is coaching/agent.ts). Fixed rules run BEFORE any AI call, and before the
 * allowance is checked (docs/COACH-AGENT-SPEC.md §6.1):
 * - physical warning words → the same stop message as "This hurts", and the plan is paused;
 * - wellbeing words (self-harm, not eating) → a fixed message pointing to real help; no AI reply.
 * DRAFT wording and word lists: for the physiologist's and Markus's review before AI is switched on.
 */
export const MESSAGE_MAX = 500;
export const HISTORY = 12; // earlier messages sent with each question

/** Spec 3.1 §5.1: words about restricting or purging. Any match also blocks nutrition for good (only Markus clears it). */
export const EATING_FLAGS = ["not eating", "stop eating", "starving myself", "starve myself", "purge", "purging", "make myself sick", "throw up after"];

const WELLBEING_FLAGS = [
  "suicid", "kill myself", "end my life", "self harm", "self-harm", "hurt myself", "cutting myself",
  // Added in build plan 2.3 (spec §6.1), for Fable's and the physiologist's review:
  "ending it all", "end it all", "want to die", "don't want to be here", "no reason to live",
  ...EATING_FLAGS,
];

const lower = (text: string) => text.toLowerCase().replace(/[’`]/g, "'");
/** Pure: does this text use any of the eating words? */
export const eatingFlag = (text: string) => EATING_FLAGS.some((w) => lower(text).includes(w));

export const WELLBEING_MESSAGE =
  "I'm a training coach, so I can't help with this the way you deserve. Please talk to someone you trust or a health professional. If you might be in danger, call your local emergency number now (000 in Australia, 911 in the US).";

export type Screen = { kind: "ok" } | { kind: "stop"; flag: string } | { kind: "wellbeing" };

/** Pure: what the fixed rules say about a member's message. */
export function screenMessage(text: string): Screen {
  const t = lower(text);
  if (WELLBEING_FLAGS.some((w) => t.includes(w))) return { kind: "wellbeing" };
  const flag = redFlag(text);
  return flag ? { kind: "stop", flag } : { kind: "ok" };
}

export { STOP_MESSAGE };
