import { createPlan } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";

/**
 * After signup or login (build plan 1.4). The server has already turned this browser's onboarding answers
 * into the member's profile (the hypest_draft cookie). With ?then=plan the plan is built straight away: Free gets
 * its first block (week 1 open), members get the full block. A trial session done before signup is already in it.
 */
export async function afterAuth(search: string): Promise<void> {
  if (new URLSearchParams(search).get("then") !== "plan") return;
  try {
    await createPlan(request);
  } catch {
    // 409 (no answers) or a block already built (e.g. from the trial): Today shows the right card.
  }
}
