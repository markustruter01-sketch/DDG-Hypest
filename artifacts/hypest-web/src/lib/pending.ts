import { createPlan } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";

/**
 * After signup or login (build plan 1.4). The server has already turned this browser's onboarding answers
 * into the member's profile (the hypest_draft cookie). With ?then=plan the plan is built straight away when
 * the member has a plan to spend; otherwise Today shows the offer card next to their answers.
 */
export async function afterAuth(search: string): Promise<void> {
  if (new URLSearchParams(search).get("then") !== "plan") return;
  try {
    await createPlan(request);
  } catch {
    // 402 (nothing bought yet) or 409 (no answers): Today shows the right card for either.
  }
}
