/**
 * Pre-exercise health check, asked before a member's first plan. DRAFT wording (Claude, 24 Oct 2026), modelled on
 * the topics of standard adult pre-exercise screening tools; the exercise physiologist confirms or replaces it.
 * Single source: the app shows these through /config, the server applies the rule, the review pack prints them.
 * Only the result is stored (any "yes", and whether the member confirmed clearance), never the single answers.
 */
export const SCREENING = {
  version: "draft-2026-10-24",
  questions: [
    "Has a doctor ever told you that you have a heart condition, or have you had a stroke?",
    "Do you get pain or discomfort in your chest, at rest or when you're active?",
    "Do you feel faint or dizzy, or lose your balance, when you exercise?",
    "In the last 12 months, have you had an asthma attack that needed urgent medical care?",
    "If you have diabetes: has your blood sugar been hard to control in the last 3 months?",
    "Are you pregnant, or have you given birth in the last 12 months?",
    "Do you have any other health condition, injury or recent surgery that could affect exercise?",
  ],
  yes_advice:
    "Because you answered yes, please check with your doctor or a health professional (such as an exercise physiologist or physiotherapist) before you start.",
  cleared_label: "A doctor or health professional has said I can do this kind of training.",
} as const;

export type ScreeningInput = { answers: boolean[]; cleared: boolean };
export type ScreeningRecord = { version: string; any_yes: boolean; cleared: boolean };

/** The stored result, or the message to show when the member can't start yet. */
export function screeningResult(input: ScreeningInput | undefined): { ok: true; record: ScreeningRecord } | { ok: false; message: string } {
  if (!input || input.answers.length !== SCREENING.questions.length) return { ok: false, message: "Please answer the health questions." };
  const anyYes = input.answers.some(Boolean);
  if (anyYes && !input.cleared) return { ok: false, message: SCREENING.yes_advice };
  return { ok: true, record: { version: SCREENING.version, any_yes: anyYes, cleared: anyYes && input.cleared } };
}
