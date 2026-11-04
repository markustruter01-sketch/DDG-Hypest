import type { CoachPrompt } from "./base";
import { MARA } from "./mara";
import { REX } from "./rex";
import { JADE } from "./jade";
import { KIP } from "./kip";
import { IVY } from "./ivy";
import { ACE } from "./ace";

export { BASE_RULES, PROMPT_VERSION, type CoachPrompt } from "./base";

export const COACH_PROMPTS: Record<string, CoachPrompt> = { mara: MARA, rex: REX, jade: JADE, kip: KIP, ivy: IVY, ace: ACE };

export function promptFor(coachId: string): CoachPrompt {
  const p = COACH_PROMPTS[coachId];
  if (!p) throw new Error(`no prompt file for coach ${coachId}`);
  return p;
}
