/**
 * Warning words in "this hurts" feedback. Any match pauses the plan and tells the member to
 * stop and see a doctor or physio. Applies on EVERY tier. DRAFT list for physiologist review.
 */
const RED_FLAGS = [
  "sharp", "stabbing", "numb", "tingl", "pins and needles", "chest", "heart", "faint", "dizzy",
  "short of breath", "can't breathe", "cannot breathe", "swollen", "swelling", "pop", "can't bear weight",
  "cannot bear weight", "blood", "vision", "headache",
];

export function redFlag(text: string): string | null {
  const t = text.toLowerCase();
  return RED_FLAGS.find((w) => t.includes(w)) ?? null;
}

export const STOP_MESSAGE =
  "Stop training and get this checked by a doctor or physiotherapist before you continue. Your plan is paused. If it is severe or sudden, call 000.";
