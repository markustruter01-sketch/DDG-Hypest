import type { Coach } from "./library";
import { EXERCISE_BY_ID } from "./library";
import { redFlag, STOP_MESSAGE } from "./safety";

/**
 * Coach chat for Coaching (Tier 2) members. Fixed rules run BEFORE any AI call:
 * - physical warning words → the same stop message as "This hurts", and the plan is paused;
 * - wellbeing words (self-harm, not eating) → a fixed message pointing to real help; no AI reply.
 * DRAFT wording and word lists: for the physiologist's and Markus's review before AI is switched on.
 */
export const DAILY_MESSAGES = 20; // per member per Brisbane day: keeps cost and misuse bounded
export const MESSAGE_MAX = 500;
export const HISTORY = 12; // earlier messages sent with each question

const WELLBEING_FLAGS = [
  "suicid", "kill myself", "end my life", "self harm", "self-harm", "hurt myself", "cutting myself",
  "not eating", "stop eating", "starving myself", "starve myself", "purge", "purging", "make myself sick", "throw up after",
];

export const WELLBEING_MESSAGE =
  "I'm a training coach, so I can't help with this the way you deserve. Please talk to someone you trust or a health professional. If you might be in danger, call your local emergency number now (000 in Australia, 911 in the US).";

export type Screen = { kind: "ok" } | { kind: "stop"; flag: string } | { kind: "wellbeing" };

/** Pure: what the fixed rules say about a member's message. */
export function screenMessage(text: string): Screen {
  const t = text.toLowerCase();
  if (WELLBEING_FLAGS.some((w) => t.includes(w))) return { kind: "wellbeing" };
  const flag = redFlag(text);
  return flag ? { kind: "stop", flag } : { kind: "ok" };
}

export { STOP_MESSAGE };

export type ChatContext = {
  coach: Coach;
  goal: string;
  experience: string;
  daysPerWeek: number;
  minutes: number;
  soreAreas: string[];
  units: string;
  /** This week's sessions of the current plan, or null with no plan. */
  week: { block: number; week: number; sessions: { day: number; title: string; done: boolean; exerciseIds: string[] }[] } | null;
};

export function chatSystem(c: ChatContext): string {
  const week = c.week
    ? `Current plan: block ${c.week.block}, week ${c.week.week}. Sessions: ${c.week.sessions
        .map((s) => `day ${s.day} "${s.title}" (${s.done ? "done" : "to do"}): ${s.exerciseIds.map((id) => EXERCISE_BY_ID.get(id)?.name ?? id).join(", ")}`)
        .join("; ")}.`
    : "The member has no plan yet.";
  return [
    `You are ${c.coach.name}, an AI coach in the Hypest training app. Discipline: ${c.coach.title}. Personality: ${c.coach.personality}. Speak in that voice.`,
    "You are an AI, not a doctor, physiotherapist or dietitian, and you say so if asked.",
    `Member: goal ${c.goal}, experience ${c.experience}, ${c.daysPerWeek} days a week, ${c.minutes} minutes a session, sore areas: ${c.soreAreas.join(", ") || "none"}. Weights in ${c.units}.`,
    week,
    "Hypest's rules build every plan; you cannot change it. What the member can do in the app: tap \"This hurts\" in a session to swap an exercise; log sets so the next block adapts; change coach on the Coach tab.",
    "Never diagnose or treat pain or injury: for any pain, tell them to stop that exercise, use \"This hurts\", and see a health professional if it continues.",
    "Never give diet, calorie, weight-loss, supplement or medication advice or numbers. Never encourage training through pain, extreme restriction or overtraining.",
    "Stay on training, form, motivation, recovery basics (sleep, rest days) and how to use the app. Politely steer anything else back to training.",
    "Reply in plain text, at most 80 words, no markdown, no emoji.",
  ].join("\n");
}
