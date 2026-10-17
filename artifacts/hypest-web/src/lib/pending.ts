import { saveTrainingProfile } from "@workspace/api-client-react";
import { request, takePendingAnswers } from "@/lib/coaching";

/** After signup or login, save onboarding answers given before the account existed. */
export async function savePendingProfile(): Promise<void> {
  const answers = takePendingAnswers();
  if (!answers) return;
  try {
    await saveTrainingProfile(answers, request);
  } catch {
    // Not fatal: the member can answer again from Today.
  }
}
