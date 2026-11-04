import { z } from "zod";
import type { Coach } from "./library";
import { EXERCISE_BY_ID } from "./library";
import type { Plan, PlanInput } from "./engine";
import { redFlag } from "./safety";
import { filterReply } from "./output-filter";

/**
 * The AI personal layer for a plan. The rules engine has already chosen every exercise, set, rep and load;
 * the AI only WRITES: a short welcome for the block and one line per session, in the coach's voice.
 * Anything that fails the checks below is dropped and the plan simply shows without it.
 * DRAFT prompt: for the physiologist's and Markus's review before AI is switched on.
 */
export const INTRO_MAX = 280;
export const NOTE_MAX = 140;

export function notesPrompt(coach: Coach, input: PlanInput, plan: Plan) {
  const system = [
    `You are ${coach.name}, an AI coach in the Hypest training app. Discipline: ${coach.title}. Personality: ${coach.personality}.`,
    "Write in that voice: warm, plain English, short sentences, no emoji, no markdown.",
    "The plan below was built and safety-checked by Hypest's rules. You must not change it: never add, remove or swap exercises, and never state sets, reps, weights, times or any other number.",
    "Never give medical, injury, nutrition, diet, weight-loss or supplement advice. Never diagnose. If the member listed sore areas, you may say the plan keeps load off them, nothing more.",
    `Reply with ONLY a JSON object: {"intro": string (at most ${INTRO_MAX} characters, a welcome to this block), "notes": [{"week": number, "day": number, "note": string (at most ${NOTE_MAX} characters, one focus or encouragement for that session)}]} with exactly one note for every session listed.`,
  ].join("\n");
  const member = {
    goal: input.goal, experience: input.experience, days_per_week: input.daysPerWeek, minutes: input.minutes,
    equipment: input.equipment, sore_areas: input.avoidAreas, block: input.block,
  };
  const sessions = plan.sessions.map((s) => ({
    week: s.week, day: s.day, title: s.title,
    exercises: s.items.map((it) => EXERCISE_BY_ID.get(it.exerciseId)?.name ?? it.exerciseId),
  }));
  return { system, user: JSON.stringify({ member, sessions }) };
}

const Reply = z.object({
  intro: z.string(),
  notes: z.array(z.object({ week: z.number().int(), day: z.number().int(), note: z.string() })),
});

/** A line is usable only if it is short, has no numbers (they could contradict the plan), no links and no warning words. */
function clean(text: string, max: number): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > max || /\d/.test(t) || /https?:|www\./i.test(t) || redFlag(t)) return null;
  if (filterReply(t, null, max) !== null) return null; // the same output filter as chat (spec §1.2)
  return t;
}

/** Pure: checks the AI's reply against the plan. Returns only what passed; null if nothing usable. */
export function parseNotes(raw: string, plan: Plan): { intro: string | null; notes: Map<string, string> } | null {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let parsed: z.infer<typeof Reply>;
  try {
    parsed = Reply.parse(JSON.parse(json));
  } catch {
    return null;
  }
  const slots = new Set(plan.sessions.map((s) => `${s.week}:${s.day}`));
  const notes = new Map<string, string>();
  for (const n of parsed.notes) {
    const key = `${n.week}:${n.day}`;
    const line = clean(n.note, NOTE_MAX);
    if (slots.has(key) && !notes.has(key) && line) notes.set(key, line);
  }
  const intro = clean(parsed.intro, INTRO_MAX);
  return intro || notes.size ? { intro, notes } : null;
}
