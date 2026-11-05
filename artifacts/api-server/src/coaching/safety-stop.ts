import { and, eq } from "drizzle-orm";
import { db, painEventsTable, plansTable, usersTable } from "@workspace/db";
import { alert } from "../lib/alerts";
import { eatingFlag } from "./chat";

/**
 * The stop flow for warning words in any member text (chat, a meal sentence, foods to avoid): the active plan is
 * paused, a pain report is kept, Markus gets an alert. The caller shows STOP_MESSAGE.
 */
export async function safetyStop(userId: number, text: string, flag: string, source: "chat" | "food"): Promise<void> {
  const paused = await db.update(plansTable).set({ status: "paused", pausedReason: `Safety stop (${source}): "${flag}"` })
    .where(and(eq(plansTable.userId, userId), eq(plansTable.status, "active"))).returning({ id: plansTable.id });
  await db.insert(painEventsTable).values({ userId, planId: paused.at(0)?.id ?? null, note: text.slice(0, 500), source, flag, stopped: true });
  void alert("info", `Safety stop: member #${userId}`, `${source === "chat" ? "Coach chat" : "Food screen"} matched "${flag}". Plan paused; member told to see a doctor or physio.`);
}

/** Spec 3.1 §5.1: nutrition off for good. Only Markus clears it, in the database, after a conversation. */
export async function blockNutrition(userId: number, why: string): Promise<void> {
  const [was] = await db.select({ blocked: usersTable.nutritionBlocked }).from(usersTable).where(eq(usersTable.id, userId));
  if (!was || was.blocked) return;
  await db.update(usersTable).set({ nutritionBlocked: true }).where(eq(usersTable.id, userId));
  void alert("info", `Nutrition blocked: member #${userId}`, `${why}. Food features are off for this member until cleared by hand.`);
}

/** Blocks nutrition when member text uses an eating word. Returns whether it did. */
export async function blockIfEatingWords(userId: number, text: string, where: string): Promise<boolean> {
  if (!eatingFlag(text)) return false;
  await blockNutrition(userId, `Eating words in ${where}`);
  return true;
}
