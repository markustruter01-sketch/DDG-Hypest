import { db, trainingProfilesTable } from "@workspace/db";
import { SaveTrainingProfileBody } from "@workspace/api-zod";
import { COACH_BY_ID, type Area, type Equipment, type Experience, type Goal } from "./library";
import { screeningResult, type ScreeningInput } from "./screening";

export type Answers = {
  coach_id: string;
  goal: Goal;
  experience: Experience;
  days_per_week: number;
  minutes: number;
  equipment: Equipment[];
  avoid_areas: Area[];
  units?: "kg" | "lb";
  health_accepted: true;
  screening?: ScreeningInput;
};

/** A coach must exist and offer the chosen goal. */
export function answersError(a: Answers): string | null {
  const coach = COACH_BY_ID.get(a.coach_id);
  if (!coach) return "unknown coach";
  if (!coach.goals.includes(a.goal)) return "this coach does not offer that goal";
  return null;
}

type ProfileValues = typeof trainingProfilesTable.$inferInsert;
export type CheckedAnswers = { ok: true; values: Omit<ProfileValues, "userId" | "id"> } | { ok: false; message: string };

/** Onboarding answers as the API receives them → the profile row to save, or why not. One rule for the
 *  member's own save and for answers given before signup (the onboarding draft, build plan 1.4). */
export function checkAnswers(raw: unknown): CheckedAnswers {
  const parsed = SaveTrainingProfileBody.strict().safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "invalid answers" };
  const a = parsed.data as Answers;
  const err = answersError(a);
  if (err) return { ok: false, message: err };
  const check = screeningResult(a.screening);
  if (!check.ok) return { ok: false, message: check.message };
  return {
    ok: true,
    values: {
      coachId: a.coach_id, goal: a.goal, experience: a.experience, daysPerWeek: a.days_per_week, minutes: a.minutes,
      equipment: [...new Set(a.equipment)], avoidAreas: [...new Set(a.avoid_areas)], units: a.units ?? "kg", healthAcceptedAt: new Date(),
      screening: check.record, updatedAt: new Date(),
    },
  };
}

export async function saveProfile(userId: number, values: Omit<ProfileValues, "userId" | "id">): Promise<void> {
  await db.insert(trainingProfilesTable).values({ userId, ...values }).onConflictDoUpdate({ target: trainingProfilesTable.userId, set: values });
}
