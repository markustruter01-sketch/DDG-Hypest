import { Router, type IRouter, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  DeleteMealParams, GetFoodResponse, LogMealBody, LogMealPhotoBody, SaveFoodSetupBody, UpdateMealBody, UpdateMealParams,
} from "@workspace/api-zod";
import { db, mealLogsTable, nutritionProfilesTable, trainingProfilesTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { accessFor, type Access } from "../coaching/access";
import { screenMessage, STOP_MESSAGE, WELLBEING_MESSAGE } from "../coaching/chat";
import { blockNutrition, safetyStop } from "../coaching/safety-stop";
import { canFood, canFoodAi, currentTargets, estimateMeal, foodState, makeMealPlan, nutritionBlocked, recordWeight, saveMealLog } from "../coaching/food";
import { AGE_MAX, AGE_MIN, ageFrom, BLOCKED_LINE } from "../coaching/nutrition";
import { checkMealItems, PHOTO_MAX_BYTES, totalsOf } from "../coaching/meal-log";
import { alert } from "../lib/alerts";

/** Nutrition-lite routes (docs/TIERS-AND-BODY-SPEC.md §5). Every answer is the whole Food screen. */
const router: IRouter = Router();

type User = ReturnType<typeof authUser>;
const send = async (res: Response, user: User, access: Access, notice: string | null = null) =>
  void res.json(GetFoodResponse.parse({ ...(await foodState(user.id, access, user.timezone)), notice }));

/** Starter-and-up gate, then the permanent block. Returns the access, or null when it has answered. */
async function gate(res: Response, user: User, ai: boolean): Promise<Access | null> {
  const access = await accessFor(user.id);
  if (!(ai ? canFoodAi(access) : canFood(access))) {
    res.status(402).json({ message: ai ? "Part of Coaching and Pro" : "Part of Starter and above" });
    return null;
  }
  if (await nutritionBlocked(user.id)) {
    res.status(403).json({ message: BLOCKED_LINE });
    return null;
  }
  return access;
}

/**
 * Member text on the Food screen goes through the same rules as chat (spec §5.1): a warning word gives the stop flow,
 * a wellbeing or eating word gives the help message and blocks nutrition. Returns the notice to show, or null.
 */
async function screened(user: User, text: string, where: string): Promise<string | null> {
  const s = screenMessage(text);
  if (s.kind === "stop") {
    await safetyStop(user.id, text, s.flag, "food");
    return STOP_MESSAGE;
  }
  if (s.kind === "wellbeing") {
    await blockNutrition(user.id, `Wellbeing or eating words in ${where}`);
    void alert("warning", `Wellbeing words on the Food screen: member #${user.id}`, "The member was shown the fixed help message. Their text is not in this alert.");
    return WELLBEING_MESSAGE;
  }
  return null;
}

router.get("/me/food", requireUser, async (_req, res) => {
  const user = authUser(res);
  await send(res, user, await accessFor(user.id));
});

router.put("/me/food/setup", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = SaveFoodSetupBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  const access = await gate(res, user, false);
  if (!access) return;
  const b = body.data;
  const age = ageFrom(b.birth_year);
  if (age > AGE_MAX || age < 0) return void res.status(400).json({ message: "Check your birth year" });
  const [training] = await db.select({ userId: trainingProfilesTable.userId }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, user.id));
  if (!training) return void res.status(409).json({ message: "Answer the training questions first" });
  for (const food of b.foods_to_avoid) {
    const notice = await screened(user, food, "foods to avoid");
    if (notice) return send(res, user, access, notice);
  }
  if (age < AGE_MIN) await blockNutrition(user.id, "Under 18 from the birth year");
  if (b.pregnant) await blockNutrition(user.id, "Pregnant or breastfeeding");
  if (await nutritionBlocked(user.id)) return send(res, user, access);
  const foods = [...new Set(b.foods_to_avoid.map((f) => f.trim()).filter(Boolean))];
  const row = { sex: b.sex, birthYear: b.birth_year, heightCm: b.height_cm, weightKg: b.weight_kg, foodsToAvoid: foods, pregnant: false, updatedAt: new Date() };
  await db.insert(nutritionProfilesTable).values({ userId: user.id, ...row }).onConflictDoUpdate({ target: nutritionProfilesTable.userId, set: row });
  await recordWeight(user.id, user.timezone, b.weight_kg);
  await currentTargets(user.id, user.timezone, true);
  await send(res, user, access);
});

router.post("/me/food/meal-plan", requireUser, async (_req, res) => {
  const user = authUser(res);
  const access = await gate(res, user, true);
  if (!access) return;
  const [tp] = await db.select({ units: trainingProfilesTable.units }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, user.id));
  const out = await makeMealPlan(user.id, access.level, user.timezone, tp?.units === "lb" ? "lb" : "kg");
  if (!out.ok) return void res.status(out.status).json({ message: out.message });
  await send(res, user, access);
});

router.post("/me/food/meals", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = LogMealBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: "invalid request" });
  const access = await gate(res, user, true);
  if (!access) return;
  if (!(await currentTargets(user.id, user.timezone))) return void res.status(409).json({ message: "Set up food first" });
  const text = body.data.text.trim();
  const notice = await screened(user, text, "a meal sentence");
  if (notice) return send(res, user, access, notice);
  const out = await estimateMeal(user.id, access.level, user.timezone, { text });
  if (!out.ok) return void res.status(out.status).json({ message: out.message });
  await saveMealLog(user.id, user.timezone, text, out.value);
  await send(res, user, access);
});

// The photo is used for this one call and then dropped: never written to the database or a log (the request logger
// records the route and status only).
router.post("/me/food/meals/photo", requireUser, async (req, res) => {
  const user = authUser(res);
  const body = LogMealPhotoBody.strict().safeParse(req.body);
  req.body = null;
  if (!body.success || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data.data)) return void res.status(400).json({ message: "invalid photo" });
  if (Math.floor((body.data.data.length * 3) / 4) > PHOTO_MAX_BYTES) return void res.status(413).json({ message: "That photo is too large" });
  const access = await gate(res, user, true);
  if (!access) return;
  if (!(await currentTargets(user.id, user.timezone))) return void res.status(409).json({ message: "Set up food first" });
  const out = await estimateMeal(user.id, access.level, user.timezone, { photo: { type: "base64", media_type: body.data.media_type, data: body.data.data } });
  if (!out.ok) return void res.status(out.status).json({ message: out.message });
  await saveMealLog(user.id, user.timezone, "photo", out.value);
  await send(res, user, access);
});

router.patch("/me/food/meals/:mealId", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = UpdateMealParams.safeParse(req.params);
  const body = UpdateMealBody.strict().safeParse(req.body);
  if (!params.success || !body.success) return void res.status(400).json({ message: "invalid request" });
  const items = checkMealItems(body.data);
  if (!items) return void res.status(400).json({ message: "Those foods can't be saved here." });
  for (const it of items) if (screenMessage(it.name).kind !== "ok") return void res.status(400).json({ message: "Those foods can't be saved here." });
  const t = totalsOf(items);
  const done = await db.update(mealLogsTable).set({ items, kcal: t.kcal, proteinG: t.protein_g })
    .where(and(eq(mealLogsTable.id, params.data.mealId), eq(mealLogsTable.userId, user.id))).returning({ id: mealLogsTable.id });
  if (!done.length) return void res.status(404).json({ message: "not found" });
  await send(res, user, await accessFor(user.id));
});

router.delete("/me/food/meals/:mealId", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = DeleteMealParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ message: "invalid request" });
  const gone = await db.delete(mealLogsTable).where(and(eq(mealLogsTable.id, params.data.mealId), eq(mealLogsTable.userId, user.id))).returning({ id: mealLogsTable.id });
  if (!gone.length) return void res.status(404).json({ message: "not found" });
  await send(res, user, await accessFor(user.id));
});

export default router;
