import { Router, type IRouter, type Response } from "express";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  CompleteSessionParams,
  CompleteSessionResponse,
  CreateNextPlanResponse,
  CreatePlanResponse,
  DevUnlockBody,
  GetProgressResponse,
  GetTrainingResponse,
  ListPastPlansResponse,
  ListCoachesResponse,
  LogSetBody,
  LogSetParams,
  LogSetResponse,
  PreviewPlanBody,
  PreviewPlanResponse,
  ReportPainBody,
  ReportPainParams,
  ReportPainResponse,
  ResumePlanBody,
  ResumePlanResponse,
  SetUnitsBody,
} from "@workspace/api-zod";
import {
  db,
  membershipsTable,
  painEventsTable,
  planItemsTable,
  planSessionsTable,
  plansTable,
  setLogsTable,
  trainingProfilesTable,
} from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { devToolsOn } from "../lib/dev-login";
import { localDay, localWeekStart } from "../lib/timezone";
import { COACH_BY_ID, COACHES, EXERCISE_BY_ID, type Area, type Coach, type Equipment, type Experience, type Goal } from "../coaching/library";
import { buildPlan, findSwap, nextLoads, WEEKS, type Plan, type PlanInput } from "../coaching/engine";
import { redFlag, STOP_MESSAGE } from "../coaching/safety";
import { notesPrompt, parseNotes } from "../coaching/ai-notes";
import { askClaude } from "../lib/ai";
import { alert } from "../lib/alerts";
import { accessFor, canAutoNext, canLog } from "../coaching/access";
import { answersError, checkAnswers, saveProfile, type Answers } from "../coaching/profile";
import { saveDraft } from "../coaching/draft";

const router: IRouter = Router();

function bad(res: Response, issues: { message: string }[]) {
  res.status(400).json({ message: issues[0]?.message ?? "invalid request" });
}

function coachView(c: Coach) {
  return { id: c.id, name: c.name, discipline: c.discipline, title: c.title, personality: c.personality, good_for: c.goodFor, photo: c.photo, goals: c.goals };
}

function toInput(a: Answers, block: number, targetLoads?: Record<string, number>): PlanInput {
  return {
    coachId: a.coach_id, goal: a.goal, experience: a.experience, daysPerWeek: a.days_per_week, minutes: a.minutes,
    equipment: [...new Set(a.equipment)], avoidAreas: [...new Set(a.avoid_areas)], block, targetLoads,
  };
}

async function profileOf(userId: number): Promise<Answers | null> {
  const [p] = await db.select().from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId)).limit(1);
  if (!p) return null;
  return {
    coach_id: p.coachId, goal: p.goal as Goal, experience: p.experience as Experience, days_per_week: p.daysPerWeek,
    minutes: p.minutes, equipment: p.equipment as Equipment[], avoid_areas: p.avoidAreas as Area[], units: p.units as "kg" | "lb", health_accepted: true,
  };
}

/** Has this member done the health check? (Profiles saved before it existed have not.) */
async function screened(userId: number): Promise<boolean> {
  const [p] = await db.select({ s: trainingProfilesTable.screening }).from(trainingProfilesTable).where(eq(trainingProfilesTable.userId, userId)).limit(1);
  return Boolean(p?.s);
}

function itemView(it: Plan["sessions"][number]["items"][number] & { id?: number | null; swappedFrom?: string | null }, logs: { set_number: number; reps: number | null; seconds: number | null; load_kg: number | null }[] = []) {
  const ex = EXERCISE_BY_ID.get(it.exerciseId);
  if (!ex) throw new Error(`unknown exercise ${it.exerciseId}`);
  return {
    id: it.id ?? null, exercise_id: ex.id, name: ex.name, cue: ex.cue, measure: ex.measure, weighted: ex.weighted,
    sets: it.sets, reps: it.reps, seconds: it.seconds, rest_seconds: it.restSeconds, target_load_kg: it.targetLoadKg,
    swapped_from: it.swappedFrom ?? null, logs,
    // A barbell-only lift: the player shows which plates go on each side (build plan 1.5).
    barbell: ex.equipment.length === 1 && ex.equipment[0] === "barbell",
  };
}

async function currentPlanRow(userId: number) {
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(and(eq(plansTable.userId, userId), inArray(plansTable.status, ["active", "paused"])))
    .orderBy(desc(plansTable.id))
    .limit(1);
  return plan ?? null;
}

async function planView(planId: number, withLogs: boolean) {
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1);
  if (!plan) throw new Error("plan vanished");
  const sessions = await db.select().from(planSessionsTable).where(eq(planSessionsTable.planId, planId)).orderBy(asc(planSessionsTable.week), asc(planSessionsTable.day));
  const items = sessions.length === 0 ? [] : await db.select().from(planItemsTable).where(inArray(planItemsTable.sessionId, sessions.map((s) => s.id))).orderBy(asc(planItemsTable.position));
  const logs = withLogs && items.length > 0 ? await db.select().from(setLogsTable).where(inArray(setLogsTable.itemId, items.map((i) => i.id))).orderBy(asc(setLogsTable.setNumber)) : [];
  const daysPerWeek = Math.max(0, ...sessions.map((s) => s.day));
  return {
    id: plan.id, coach_id: plan.coachId, block: plan.block, weeks: plan.weeks, days_per_week: daysPerWeek,
    status: plan.status as "active" | "paused" | "done", paused_reason: plan.pausedReason, intro: plan.intro,
    sessions: sessions.map((s) => ({
      id: s.id, week: s.week, day: s.day, title: s.title, note: s.note, completed_at: s.completedAt?.toISOString() ?? null,
      items: items.filter((i) => i.sessionId === s.id).map((i) =>
        itemView(i, logs.filter((l) => l.itemId === i.id).map((l) => ({ set_number: l.setNumber, reps: l.reps, seconds: l.seconds, load_kg: l.loadKg })))),
    })),
  };
}

/**
 * AI personal layer: the coach's welcome and one line per session, added after the plan is saved.
 * Off, over budget or failed → the plan stays exactly as the rules built it. Never throws.
 */
async function addAiNotes(planId: number, userId: number, plan: Plan, input: PlanInput): Promise<void> {
  const coach = COACH_BY_ID.get(plan.coachId);
  if (!coach) return;
  const prompt = notesPrompt(coach, input, plan);
  const raw = await askClaude({ tier: "plan", purpose: "plan_notes", system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: 2000, userId });
  if (!raw) return;
  const notes = parseNotes(raw, plan);
  try {
    const [row] = await db.select({ record: plansTable.record }).from(plansTable).where(eq(plansTable.id, planId));
    const record = { ...(row?.record as object), ai: { at: new Date().toISOString(), raw, accepted: notes ? { intro: notes.intro, notes: Object.fromEntries(notes.notes) } : null } };
    await db.transaction(async (tx) => {
      await tx.update(plansTable).set({ intro: notes?.intro ?? null, record }).where(eq(plansTable.id, planId));
      for (const [key, note] of notes?.notes ?? []) {
        const [week, day] = key.split(":").map(Number);
        await tx.update(planSessionsTable).set({ note }).where(and(eq(planSessionsTable.planId, planId), eq(planSessionsTable.week, week!), eq(planSessionsTable.day, day!)));
      }
    });
  } catch {
    // The plan is already saved; notes are optional.
  }
}

async function savePlan(userId: number, plan: Plan, input: PlanInput, block: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(plansTable)
      .values({ userId, coachId: plan.coachId, block, weeks: plan.weeks, status: "active", engine: "rules", record: { input, plan } })
      .returning({ id: plansTable.id });
    if (!row) throw new Error("plan insert failed");
    for (const s of plan.sessions) {
      const [sess] = await tx.insert(planSessionsTable).values({ planId: row.id, week: s.week, day: s.day, title: s.title }).returning({ id: planSessionsTable.id });
      if (!sess) throw new Error("session insert failed");
      if (s.items.length > 0) {
        await tx.insert(planItemsTable).values(s.items.map((it, i) => ({
          sessionId: sess.id, position: i + 1, exerciseId: it.exerciseId, sets: it.sets, reps: it.reps, seconds: it.seconds,
          restSeconds: it.restSeconds, targetLoadKg: it.targetLoadKg,
        })));
      }
    }
    return row.id;
  });
}

async function trainingState(userId: number) {
  const access = await accessFor(userId);
  const profile = await profileOf(userId);
  const current = await currentPlanRow(userId);
  return {
    profile,
    access: { level: access.level, intro_available: access.intro_available, plan_credits: access.plan_credits },
    plan: current ? await planView(current.id, canLog(access)) : null,
  };
}

/** Item and its plan, only if it belongs to this user. */
async function ownedItem(userId: number, itemId: number) {
  const [row] = await db
    .select({ item: planItemsTable, plan: plansTable, session: planSessionsTable })
    .from(planItemsTable)
    .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
    .innerJoin(plansTable, eq(plansTable.id, planSessionsTable.planId))
    .where(and(eq(planItemsTable.id, itemId), eq(plansTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

// ---------- Public ----------

router.get("/coaches", (_req, res) => {
  res.json(ListCoachesResponse.parse(COACHES.map(coachView)));
});

router.post("/coaching/preview", (req, res) => {
  const parsed = PreviewPlanBody.strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const a = parsed.data as Answers;
  const err = answersError(a);
  if (err) return void res.status(400).json({ message: err });
  const plan = buildPlan(toInput(a, 1));
  res.json(PreviewPlanResponse.parse({
    id: null, coach_id: plan.coachId, block: 1, weeks: plan.weeks, days_per_week: a.days_per_week, status: "preview", paused_reason: null, intro: null,
    sessions: plan.sessions.filter((s) => s.week === 1).map((s) => ({ id: null, week: s.week, day: s.day, title: s.title, note: null, completed_at: null, items: s.items.map((it) => itemView(it)) })),
  }));
});

// Answers given before signup are kept server-side for a day under an httpOnly cookie (build plan 1.4).
router.put("/onboarding/draft", async (req, res) => {
  const saved = await saveDraft(req, res, req.body);
  if (!saved.ok) return void res.status(400).json({ message: saved.message });
  res.status(204).end();
});

// ---------- Member ----------

// Every block except the current one, newest first, with how many sessions were done.
router.get("/me/plans/history", requireUser, async (_req, res) => {
  const user = authUser(res);
  const current = await currentPlanRow(user.id);
  const rows = await db
    .select({
      id: plansTable.id, block: plansTable.block, coach_id: plansTable.coachId, weeks: plansTable.weeks, created_at: plansTable.createdAt,
      sessions_done: sql<number>`count(${planSessionsTable.completedAt})::int`,
      sessions_total: sql<number>`count(${planSessionsTable.id})::int`,
    })
    .from(plansTable)
    .leftJoin(planSessionsTable, eq(planSessionsTable.planId, plansTable.id))
    .where(and(eq(plansTable.userId, user.id), current ? ne(plansTable.id, current.id) : undefined))
    .groupBy(plansTable.id)
    .orderBy(desc(plansTable.id));
  res.json(ListPastPlansResponse.parse(rows));
});

router.get("/me/training", requireUser, async (_req, res) => {
  res.json(GetTrainingResponse.parse(await trainingState(authUser(res).id)));
});

// Display choice only: loads stay in kg. Doesn't touch the answers or the health acceptance time.
router.put("/me/training/units", requireUser, async (req, res) => {
  const user = authUser(res);
  const parsed = SetUnitsBody.strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const updated = await db
    .update(trainingProfilesTable)
    .set({ units: parsed.data.units })
    .where(eq(trainingProfilesTable.userId, user.id))
    .returning({ id: trainingProfilesTable.id });
  if (!updated.length) return void res.status(409).json({ message: "no training profile yet" });
  res.json(GetTrainingResponse.parse(await trainingState(user.id)));
});

router.put("/me/training/profile", requireUser, async (req, res) => {
  const user = authUser(res);
  const checked = checkAnswers(req.body);
  if (!checked.ok) return void res.status(400).json({ message: checked.message });
  await saveProfile(user.id, checked.values);
  res.json(GetTrainingResponse.parse(await trainingState(user.id)));
});

router.post("/me/plans", requireUser, async (_req, res) => {
  const user = authUser(res);
  const profile = await profileOf(user.id);
  if (!profile || !(await screened(user.id))) return void res.status(409).json({ message: "answer the questions first" });
  const access = await accessFor(user.id);
  const current = await currentPlanRow(user.id);
  // Members (Tier 1/2) can restart with new answers or a new coach; one-off buyers finish the block they paid for.
  if (current && !canAutoNext(access)) return void res.status(409).json({ message: "finish your current plan first" });
  if (access.creditId === null && !canAutoNext(access)) return void res.status(402).json({ message: "get a plan or membership first" });
  if (current) await db.update(plansTable).set({ status: "done" }).where(eq(plansTable.id, current.id));
  const [last] = await db.select({ block: plansTable.block }).from(plansTable).where(eq(plansTable.userId, user.id)).orderBy(desc(plansTable.id)).limit(1);
  const block = (last?.block ?? 0) + 1;
  const input = toInput(profile, block);
  const built = buildPlan(input);
  const planId = await savePlan(user.id, built, input, block);
  await addAiNotes(planId, user.id, built, input);
  if (access.creditId !== null) {
    await db.update(membershipsTable).set({ usedAt: new Date() }).where(eq(membershipsTable.id, access.creditId));
  }
  res.status(201).json(CreatePlanResponse.parse(await planView(planId, canLog(access))));
});

router.post("/me/plans/next", requireUser, async (_req, res) => {
  const user = authUser(res);
  const current = await currentPlanRow(user.id);
  const profile = await profileOf(user.id);
  if (!current || !profile) return void res.status(409).json({ message: "no current plan" });
  const access = await accessFor(user.id);
  if (!canAutoNext(access) && access.creditId === null) return void res.status(402).json({ message: "a membership or another plan is needed" });

  // Tier 2: set next loads from the last two weeks of logs.
  let targetLoads: Record<string, number> | undefined;
  if (canLog(access)) {
    const rows = await db
      .select({ exerciseId: setLogsTable.exerciseId, targetReps: planItemsTable.reps, reps: setLogsTable.reps, loadKg: setLogsTable.loadKg, week: planSessionsTable.week })
      .from(setLogsTable)
      .innerJoin(planItemsTable, eq(planItemsTable.id, setLogsTable.itemId))
      .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
      .where(eq(planSessionsTable.planId, current.id));
    targetLoads = nextLoads(rows.filter((r) => r.week >= WEEKS - 1));
  }
  const block = current.block + 1;
  const input = toInput(profile, block, targetLoads);
  const plan = buildPlan(input);
  await db.update(plansTable).set({ status: "done" }).where(eq(plansTable.id, current.id));
  const planId = await savePlan(user.id, plan, input, block);
  await addAiNotes(planId, user.id, plan, input);
  if (!canAutoNext(access) && access.creditId !== null) {
    await db.update(membershipsTable).set({ usedAt: new Date() }).where(eq(membershipsTable.id, access.creditId));
  }
  res.status(201).json(CreateNextPlanResponse.parse(await planView(planId, canLog(access))));
});

router.post("/me/plans/resume", requireUser, async (req, res) => {
  const user = authUser(res);
  // A safety pause lifts only with the member's own confirmation that they were checked (build plan 1.2).
  const body = ResumePlanBody.strict().safeParse(req.body);
  if (!body.success) return bad(res, body.error.issues);
  if (body.data.acknowledged !== true) {
    return void res.status(400).json({ message: "Tick that a doctor or physiotherapist has checked you before you resume." });
  }
  const current = await currentPlanRow(user.id);
  if (!current || current.status !== "paused") return void res.status(409).json({ message: "nothing to resume" });
  await db.transaction(async (tx) => {
    const resolved = await tx
      .update(painEventsTable)
      .set({ resolvedAt: new Date(), resolvedNote: body.data.note })
      .where(and(eq(painEventsTable.userId, user.id), eq(painEventsTable.stopped, true), isNull(painEventsTable.resolvedAt)))
      .returning({ id: painEventsTable.id });
    if (resolved.length === 0) {
      // Paused before pain_events existed: record the resume itself.
      await tx.insert(painEventsTable).values({
        userId: user.id, planId: current.id, note: current.pausedReason ?? "safety pause", source: "resume",
        flag: null, stopped: true, resolvedAt: new Date(), resolvedNote: body.data.note,
      });
    }
    await tx.update(plansTable).set({ status: "active", pausedReason: null }).where(eq(plansTable.id, current.id));
  });
  res.json(ResumePlanResponse.parse(await planView(current.id, canLog(await accessFor(user.id)))));
});

router.post("/me/sessions/:sessionId/complete", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = CompleteSessionParams.safeParse(req.params);
  if (!params.success) return bad(res, params.error.issues);
  const [row] = await db
    .select({ id: planSessionsTable.id, planId: planSessionsTable.planId })
    .from(planSessionsTable)
    .innerJoin(plansTable, eq(plansTable.id, planSessionsTable.planId))
    .where(and(eq(planSessionsTable.id, params.data.sessionId), eq(plansTable.userId, user.id)))
    .limit(1);
  if (!row) return void res.status(404).json({ message: "not found" });
  await db.update(planSessionsTable).set({ completedAt: new Date() }).where(and(eq(planSessionsTable.id, row.id), isNull(planSessionsTable.completedAt)));
  const view = await planView(row.planId, canLog(await accessFor(user.id)));
  const session = view.sessions.find((s) => s.id === row.id);
  res.json(CompleteSessionResponse.parse(session));
});

router.put("/me/items/:itemId/sets/:setNumber", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = LogSetParams.safeParse(req.params);
  if (!params.success) return bad(res, params.error.issues);
  const body = LogSetBody.strict().safeParse(req.body);
  if (!body.success) return bad(res, body.error.issues);
  if (!canLog(await accessFor(user.id))) return void res.status(402).json({ message: "logging is part of Coaching" });
  const owned = await ownedItem(user.id, params.data.itemId);
  if (!owned) return void res.status(404).json({ message: "not found" });
  const n = params.data.setNumber;
  if (n < 1 || n > owned.item.sets) return void res.status(400).json({ message: "no such set" });
  const values = { reps: body.data.reps, seconds: body.data.seconds, loadKg: body.data.load_kg };
  await db.insert(setLogsTable).values({ itemId: owned.item.id, exerciseId: owned.item.exerciseId, setNumber: n, ...values }).onConflictDoUpdate({ target: [setLogsTable.itemId, setLogsTable.setNumber], set: values });
  res.json(LogSetResponse.parse({ set_number: n, reps: values.reps, seconds: values.seconds, load_kg: values.loadKg }));
});

router.post("/me/items/:itemId/hurts", requireUser, async (req, res) => {
  const user = authUser(res);
  const params = ReportPainParams.safeParse(req.params);
  if (!params.success) return bad(res, params.error.issues);
  const body = ReportPainBody.strict().safeParse(req.body);
  if (!body.success) return bad(res, body.error.issues);
  const owned = await ownedItem(user.id, params.data.itemId);
  if (!owned) return void res.status(404).json({ message: "not found" });

  // Safety first, on every tier. Every report is kept (pain_events), stop or not.
  const flag = redFlag(body.data.text);
  await db.insert(painEventsTable).values({
    userId: user.id, planId: owned.plan.id, itemId: owned.item.id, exerciseId: owned.item.exerciseId,
    area: body.data.area ?? null, note: body.data.text, source: "hurts", flag, stopped: flag !== null,
  });
  if (flag) {
    await db.update(plansTable).set({ status: "paused", pausedReason: `Safety stop: "${flag}"` }).where(eq(plansTable.id, owned.plan.id));
    void alert("info", `Safety stop: member #${user.id}`, `"This hurts" matched "${flag}". Plan paused; member told to see a doctor or physio.`);
    return void res.json(ReportPainResponse.parse({ stopped: true, message: STOP_MESSAGE, swapped_to: null, needs_tier2: false }));
  }

  const access = await accessFor(user.id);
  if (!canLog(access)) {
    return void res.json(ReportPainResponse.parse({
      stopped: false, needs_tier2: true, swapped_to: null,
      message: "Skip this one today. If it keeps hurting, see a physio. Coaching swaps it for a gentler exercise automatically.",
    }));
  }

  const ex = EXERCISE_BY_ID.get(owned.item.exerciseId);
  const profile = await profileOf(user.id);
  const coach = COACH_BY_ID.get(owned.plan.coachId);
  if (!ex || !profile || !coach) throw new Error("plan data missing");
  const area = (body.data.area ?? ex.loads.at(0)) as Area | undefined;
  const avoid = [...new Set([...profile.avoid_areas, ...(area ? [area] : [])])];
  const swap = findSwap(ex, { equipment: profile.equipment, avoidAreas: avoid, experience: profile.experience }, coach);
  if (area && !profile.avoid_areas.includes(area)) {
    await db.update(trainingProfilesTable).set({ avoidAreas: avoid, updatedAt: new Date() }).where(eq(trainingProfilesTable.userId, user.id));
  }
  if (!swap) {
    return void res.json(ReportPainResponse.parse({ stopped: false, needs_tier2: false, swapped_to: null, message: "Skip this one for now. Nothing in your plan safely replaces it, so rest that area." }));
  }

  // Replace this exercise in every session not yet done, leaving items that already have logged sets.
  const open = await db
    .select({ id: planItemsTable.id })
    .from(planItemsTable)
    .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
    .leftJoin(setLogsTable, eq(setLogsTable.itemId, planItemsTable.id))
    .where(and(eq(planSessionsTable.planId, owned.plan.id), isNull(planSessionsTable.completedAt), eq(planItemsTable.exerciseId, ex.id), isNull(setLogsTable.id)));
  const sameMeasure = swap.measure === ex.measure;
  for (const o of open) {
    await db.update(planItemsTable).set({
      exerciseId: swap.id, swappedFrom: ex.id, targetLoadKg: null,
      ...(sameMeasure ? {} : swap.measure === "reps" ? { reps: 10, seconds: null } : { reps: null, seconds: 30 }),
    }).where(eq(planItemsTable.id, o.id));
  }
  res.json(ReportPainResponse.parse({ stopped: false, needs_tier2: false, swapped_to: swap.name, message: `Swapped for ${swap.name} for the rest of this plan.` }));
});

router.get("/me/progress", requireUser, async (_req, res) => {
  const user = authUser(res);
  if (!canLog(await accessFor(user.id))) return void res.status(402).json({ message: "progress is part of Coaching" });

  const done = await db
    .select({ completedAt: planSessionsTable.completedAt })
    .from(planSessionsTable)
    .innerJoin(plansTable, eq(plansTable.id, planSessionsTable.planId))
    .where(eq(plansTable.userId, user.id));
  const tz = user.timezone;
  const days = new Set(done.flatMap((d) => (d.completedAt ? [localDay(d.completedAt, tz)] : [])));
  let streak = 0;
  let day = localDay(new Date(), tz);
  if (!days.has(day)) day -= 1; // today not trained yet still keeps yesterday's streak
  while (days.has(day)) { streak += 1; day -= 1; }

  const logs = await db
    .select({ exerciseId: setLogsTable.exerciseId, reps: setLogsTable.reps, loadKg: setLogsTable.loadKg, createdAt: setLogsTable.createdAt })
    .from(setLogsTable)
    .innerJoin(planItemsTable, eq(planItemsTable.id, setLogsTable.itemId))
    .innerJoin(planSessionsTable, eq(planSessionsTable.id, planItemsTable.sessionId))
    .innerJoin(plansTable, eq(plansTable.id, planSessionsTable.planId))
    .where(eq(plansTable.userId, user.id));

  const best = new Map<string, { load: number; reps: number }>();
  const volume = new Map<string, number>();
  for (const l of logs) {
    if (l.loadKg === null || l.reps === null) continue;
    const b = best.get(l.exerciseId);
    if (!b || l.loadKg > b.load) best.set(l.exerciseId, { load: l.loadKg, reps: l.reps });
    const wk = localWeekStart(l.createdAt, tz);
    volume.set(wk, (volume.get(wk) ?? 0) + l.loadKg * l.reps);
  }
  res.json(GetProgressResponse.parse({
    streak_days: streak,
    sessions_done: done.filter((d) => d.completedAt).length,
    best_lifts: [...best].map(([id, v]) => ({ exercise_id: id, name: EXERCISE_BY_ID.get(id)?.name ?? id, load_kg: v.load, reps: v.reps })).sort((a, b) => b.load_kg - a.load_kg).slice(0, 6),
    weekly_volume: [...volume].map(([week_start, volume_kg]) => ({ week_start, volume_kg: Math.round(volume_kg) })).sort((a, b) => a.week_start.localeCompare(b.week_start)).slice(-8),
  }));
});

// ---------- Development only ----------

router.post("/dev/unlock", requireUser, async (req, res) => {
  if (!devToolsOn()) return void res.status(404).json({ message: "not found" });
  const user = authUser(res);
  const body = DevUnlockBody.strict().safeParse(req.body);
  if (!body.success) return bad(res, body.error.issues);
  const kind = body.data.kind;
  const access = await accessFor(user.id);
  if (kind === "intro_plan" && !access.intro_available) return void res.status(409).json({ message: "intro already used" });
  const month = new Date(Date.now() + 30 * 86_400_000);
  await db.insert(membershipsTable).values({ userId: user.id, kind, status: "active", test: true, endsAt: kind === "tier1" || kind === "tier2" ? month : null });
  res.json(GetTrainingResponse.parse(await trainingState(user.id)));
});

export default router;
