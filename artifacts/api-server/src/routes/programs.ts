import { Router, type IRouter, type Response } from "express";
import { type SQL, and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  CreateLessonBody,
  CreateLessonParams,
  CreateLessonResponse,
  CreateProgramBody,
  CreateProgramResponse,
  DeleteLessonParams,
  GetMyProgramParams,
  GetMyProgramResponse,
  GetPublishedProgramParams,
  GetPublishedProgramResponse,
  ListMyProgramsResponse,
  ListPublishedProgramsQueryParams,
  ListPublishedProgramsResponse,
  PublishProgramParams,
  PublishProgramResponse,
  ReorderLessonsBody,
  ReorderLessonsParams,
  ReorderLessonsResponse,
  UnpublishProgramParams,
  UnpublishProgramResponse,
  UpdateLessonBody,
  UpdateLessonParams,
  UpdateLessonResponse,
  UpdateMyProgramBody,
  UpdateMyProgramParams,
  UpdateMyProgramResponse,
} from "@workspace/api-zod";
import { db, lessonsTable, programsTable, usersTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { youtubeUrlError } from "../lib/youtube-url";

const router: IRouter = Router();

const programColumns = {
  id: programsTable.id,
  creatorId: programsTable.creatorId,
  title: programsTable.title,
  description: programsTable.description,
  priceCents: programsTable.priceCents,
  status: programsTable.status,
};

const lessonColumns = {
  id: lessonsTable.id,
  position: lessonsTable.position,
  title: lessonsTable.title,
  body: lessonsTable.body,
  sets: lessonsTable.sets,
  reps: lessonsTable.reps,
  durationSeconds: lessonsTable.durationSeconds,
  mediaSource: lessonsTable.mediaSource,
  mediaRef: lessonsTable.mediaRef,
};

const PUBLIC_FORBIDDEN_KEYS = new Set([
  "lessons",
  "lesson",
  "body",
  "sets",
  "reps",
  "duration_seconds",
  "media_source",
  "media_ref",
  "position",
  "password_hash",
  "token_hash",
]);

type ProgramRow = {
  id: number;
  creatorId: number;
  title: string;
  description: string | null;
  priceCents: number;
  status: string;
};

type LessonRow = {
  id: number;
  position: number;
  title: string;
  body: string | null;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  mediaSource: string | null;
  mediaRef: string | null;
};

function invalidMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "invalid request";
}

function notFound(res: Response): void {
  res.status(404).json({ message: "not found" });
}

function asStatus(value: string): "draft" | "published" {
  if (value === "draft" || value === "published") {
    return value;
  }
  throw new Error("unexpected program status");
}

function asMediaSource(value: string | null): "youtube" | null {
  if (value === null) {
    return null;
  }
  if (value === "youtube") {
    return "youtube";
  }
  throw new Error("unexpected media source");
}

function toLesson(lesson: LessonRow) {
  return {
    id: lesson.id,
    position: lesson.position,
    title: lesson.title,
    body: lesson.body,
    sets: lesson.sets,
    reps: lesson.reps,
    duration_seconds: lesson.durationSeconds,
    media_source: asMediaSource(lesson.mediaSource),
    media_ref: lesson.mediaRef,
  };
}

function toMyProgram(program: ProgramRow, lessons: LessonRow[]) {
  return {
    id: program.id,
    title: program.title,
    description: program.description,
    price_cents: program.priceCents,
    status: asStatus(program.status),
    lessons: lessons.map(toLesson),
  };
}

function assertNoLessonContent(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoLessonContent(item);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const key of Object.keys(value)) {
    if (PUBLIC_FORBIDDEN_KEYS.has(key)) {
      throw new Error("refusing to send lesson content");
    }
  }
}

async function lessonCounts(programIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (programIds.length === 0) {
    return counts;
  }
  const rows = await db
    .select({
      programId: lessonsTable.programId,
      value: count(),
    })
    .from(lessonsTable)
    .where(inArray(lessonsTable.programId, programIds))
    .groupBy(lessonsTable.programId);
  for (const row of rows) {
    counts.set(row.programId, Number(row.value));
  }
  return counts;
}

async function loadLessons(programId: number): Promise<LessonRow[]> {
  return db
    .select(lessonColumns)
    .from(lessonsTable)
    .where(eq(lessonsTable.programId, programId))
    .orderBy(asc(lessonsTable.position));
}

async function findOwned(userId: number, programId: number): Promise<ProgramRow | null> {
  const [program] = await db
    .select(programColumns)
    .from(programsTable)
    .where(and(eq(programsTable.id, programId), eq(programsTable.creatorId, userId)))
    .limit(1);
  return program ?? null;
}

async function touchProgram(programId: number): Promise<void> {
  await db
    .update(programsTable)
    .set({ updatedAt: new Date() })
    .where(eq(programsTable.id, programId));
}

function readId(schema: { safeParse: (data: unknown) => { success: true; data: { id: number } } | { success: false; error: { issues: { message: string }[] } } }, params: unknown, res: Response): number | undefined {
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    res.status(400).json({ message: invalidMessage(parsed.error.issues) });
    return undefined;
  }
  return parsed.data.id;
}

/** Single source for public program cards: published only, never lesson content. */
async function publicPrograms(where: SQL | undefined) {
  const rows = await db
    .select({
      id: programsTable.id,
      title: programsTable.title,
      description: programsTable.description,
      priceCents: programsTable.priceCents,
      creatorDisplayName: usersTable.displayName,
      creatorHandle: usersTable.handle,
    })
    .from(programsTable)
    .innerJoin(usersTable, eq(usersTable.id, programsTable.creatorId))
    .where(and(eq(programsTable.status, "published"), where))
    .orderBy(desc(programsTable.id));

  const counts = await lessonCounts(rows.map((row) => row.id));
  const payload = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price_cents: row.priceCents,
    creator_display_name: row.creatorDisplayName,
    creator_handle: row.creatorHandle,
    lesson_count: counts.get(row.id) ?? 0,
  }));
  assertNoLessonContent(payload);
  return payload;
}

router.get("/programs", async (req, res) => {
  const query = ListPublishedProgramsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: invalidMessage(query.error.issues) });
    return;
  }
  const creator = query.data.creator;
  const payload = await publicPrograms(creator === undefined ? undefined : eq(usersTable.handle, creator));
  res.json(ListPublishedProgramsResponse.parse(payload));
});

router.get("/programs/mine", requireUser, async (_req, res) => {
  const user = authUser(res);

  const rows = await db
    .select({
      id: programsTable.id,
      title: programsTable.title,
      description: programsTable.description,
      priceCents: programsTable.priceCents,
      status: programsTable.status,
    })
    .from(programsTable)
    .where(eq(programsTable.creatorId, user.id))
    .orderBy(desc(programsTable.updatedAt));

  const counts = await lessonCounts(rows.map((row) => row.id));
  const payload = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price_cents: row.priceCents,
    status: asStatus(row.status),
    lesson_count: counts.get(row.id) ?? 0,
  }));
  res.json(ListMyProgramsResponse.parse(payload));
});

router.post("/programs", requireUser, async (req, res) => {
  const user = authUser(res);

  const parsed = CreateProgramBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidMessage(parsed.error.issues) });
    return;
  }

  const [program] = await db
    .insert(programsTable)
    .values({
      creatorId: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priceCents: parsed.data.price_cents,
      status: "draft",
    })
    .returning(programColumns);

  if (!program) {
    throw new Error("program insert returned no row");
  }

  res.status(201).json(CreateProgramResponse.parse(toMyProgram(program, [])));
});

router.get("/programs/mine/:id", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(GetMyProgramParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const program = await findOwned(user.id, programId);
  if (!program) {
    notFound(res);
    return;
  }
  const lessons = await loadLessons(program.id);
  res.json(GetMyProgramResponse.parse(toMyProgram(program, lessons)));
});

router.patch("/programs/mine/:id", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(UpdateMyProgramParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const parsed = UpdateMyProgramBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidMessage(parsed.error.issues) });
    return;
  }

  const existing = await findOwned(user.id, programId);
  if (!existing) {
    notFound(res);
    return;
  }

  const changes: {
    title?: string;
    description?: string | null;
    priceCents?: number;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) {
    changes.title = parsed.data.title;
  }
  if (parsed.data.description !== undefined) {
    changes.description = parsed.data.description;
  }
  if (parsed.data.price_cents !== undefined) {
    changes.priceCents = parsed.data.price_cents;
  }

  const [program] = await db
    .update(programsTable)
    .set(changes)
    .where(eq(programsTable.id, existing.id))
    .returning(programColumns);

  if (!program) {
    notFound(res);
    return;
  }

  const lessons = await loadLessons(program.id);
  res.json(UpdateMyProgramResponse.parse(toMyProgram(program, lessons)));
});

router.post("/programs/mine/:id/lessons", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(CreateLessonParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const parsed = CreateLessonBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidMessage(parsed.error.issues) });
    return;
  }

  const program = await findOwned(user.id, programId);
  if (!program) {
    notFound(res);
    return;
  }

  const mediaSource = parsed.data.media_source ?? null;
  const mediaRef = parsed.data.media_ref ?? null;
  const mediaProblem = youtubeUrlError(mediaSource, mediaRef);
  if (mediaProblem) {
    res.status(400).json({ message: mediaProblem });
    return;
  }

  const [last] = await db
    .select({ position: lessonsTable.position })
    .from(lessonsTable)
    .where(eq(lessonsTable.programId, program.id))
    .orderBy(desc(lessonsTable.position))
    .limit(1);

  const [lesson] = await db
    .insert(lessonsTable)
    .values({
      programId: program.id,
      position: (last?.position ?? 0) + 1,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      sets: parsed.data.sets ?? null,
      reps: parsed.data.reps ?? null,
      durationSeconds: parsed.data.duration_seconds ?? null,
      mediaSource,
      mediaRef: mediaRef === "" ? null : mediaRef,
    })
    .returning(lessonColumns);

  if (!lesson) {
    throw new Error("lesson insert returned no row");
  }

  await touchProgram(program.id);
  res.status(201).json(CreateLessonResponse.parse(toLesson(lesson)));
});

router.post("/programs/mine/:id/lessons/reorder", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(ReorderLessonsParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const parsed = ReorderLessonsBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidMessage(parsed.error.issues) });
    return;
  }

  const program = await findOwned(user.id, programId);
  if (!program) {
    notFound(res);
    return;
  }

  const existing = await loadLessons(program.id);
  const requested = parsed.data.lesson_ids;
  const existingIds = new Set(existing.map((lesson) => lesson.id));
  const uniqueRequested = new Set(requested);
  const sameLessons =
    requested.length === existing.length &&
    uniqueRequested.size === requested.length &&
    requested.every((id) => existingIds.has(id));
  if (!sameLessons) {
    res.status(400).json({ message: "lesson_ids must list each lesson once" });
    return;
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < requested.length; index += 1) {
      const lessonId = requested[index];
      if (lessonId === undefined) {
        continue;
      }
      await tx
        .update(lessonsTable)
        .set({ position: -(index + 1) })
        .where(and(eq(lessonsTable.id, lessonId), eq(lessonsTable.programId, program.id)));
    }
    for (let index = 0; index < requested.length; index += 1) {
      const lessonId = requested[index];
      if (lessonId === undefined) {
        continue;
      }
      await tx
        .update(lessonsTable)
        .set({ position: index + 1 })
        .where(and(eq(lessonsTable.id, lessonId), eq(lessonsTable.programId, program.id)));
    }
  });

  await touchProgram(program.id);
  const lessons = await loadLessons(program.id);
  res.json(ReorderLessonsResponse.parse(lessons.map(toLesson)));
});

router.patch("/programs/mine/:id/lessons/:lessonId", requireUser, async (req, res) => {
  const user = authUser(res);
  const parsedParams = UpdateLessonParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ message: invalidMessage(parsedParams.error.issues) });
    return;
  }
  const parsed = UpdateLessonBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidMessage(parsed.error.issues) });
    return;
  }

  const program = await findOwned(user.id, parsedParams.data.id);
  if (!program) {
    notFound(res);
    return;
  }

  const [current] = await db
    .select(lessonColumns)
    .from(lessonsTable)
    .where(and(eq(lessonsTable.id, parsedParams.data.lessonId), eq(lessonsTable.programId, program.id)))
    .limit(1);

  if (!current) {
    notFound(res);
    return;
  }

  const mediaSource = parsed.data.media_source !== undefined ? parsed.data.media_source : current.mediaSource;
  const mediaRef = parsed.data.media_ref !== undefined ? parsed.data.media_ref : current.mediaRef;
  const mediaProblem = youtubeUrlError(mediaSource, mediaRef);
  if (mediaProblem) {
    res.status(400).json({ message: mediaProblem });
    return;
  }

  const changes: {
    title?: string;
    body?: string | null;
    sets?: number | null;
    reps?: number | null;
    durationSeconds?: number | null;
    mediaSource?: string | null;
    mediaRef?: string | null;
  } = {};
  if (parsed.data.title !== undefined) {
    changes.title = parsed.data.title;
  }
  if (parsed.data.body !== undefined) {
    changes.body = parsed.data.body;
  }
  if (parsed.data.sets !== undefined) {
    changes.sets = parsed.data.sets;
  }
  if (parsed.data.reps !== undefined) {
    changes.reps = parsed.data.reps;
  }
  if (parsed.data.duration_seconds !== undefined) {
    changes.durationSeconds = parsed.data.duration_seconds;
  }
  if (parsed.data.media_source !== undefined) {
    changes.mediaSource = parsed.data.media_source;
  }
  if (parsed.data.media_ref !== undefined) {
    changes.mediaRef = parsed.data.media_ref === "" ? null : parsed.data.media_ref;
  }

  const [lesson] = await db
    .update(lessonsTable)
    .set(changes)
    .where(eq(lessonsTable.id, current.id))
    .returning(lessonColumns);

  if (!lesson) {
    notFound(res);
    return;
  }

  await touchProgram(program.id);
  res.json(UpdateLessonResponse.parse(toLesson(lesson)));
});

router.delete("/programs/mine/:id/lessons/:lessonId", requireUser, async (req, res) => {
  const user = authUser(res);
  const parsedParams = DeleteLessonParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ message: invalidMessage(parsedParams.error.issues) });
    return;
  }

  const program = await findOwned(user.id, parsedParams.data.id);
  if (!program) {
    notFound(res);
    return;
  }

  const deleted = await db
    .delete(lessonsTable)
    .where(and(eq(lessonsTable.id, parsedParams.data.lessonId), eq(lessonsTable.programId, program.id)))
    .returning({ id: lessonsTable.id });

  if (deleted.length === 0) {
    notFound(res);
    return;
  }

  // A published program must always have at least one lesson: deleting the last one unpublishes it.
  const remaining = await lessonCounts([program.id]);
  await db
    .update(programsTable)
    .set({ updatedAt: new Date(), ...(remaining.has(program.id) ? {} : { status: "draft" }) })
    .where(eq(programsTable.id, program.id));
  res.status(204).end();
});

router.post("/programs/mine/:id/publish", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(PublishProgramParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const existing = await findOwned(user.id, programId);
  if (!existing) {
    notFound(res);
    return;
  }

  const lessons = await loadLessons(existing.id);
  if (lessons.length < 1) {
    res.status(400).json({ message: "publish needs at least one lesson" });
    return;
  }
  if (existing.priceCents < 500) {
    res.status(400).json({ message: "price_cents must be at least 500" });
    return;
  }

  const [program] = await db
    .update(programsTable)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(programsTable.id, existing.id))
    .returning(programColumns);

  if (!program) {
    notFound(res);
    return;
  }

  res.json(PublishProgramResponse.parse(toMyProgram(program, lessons)));
});

router.post("/programs/mine/:id/unpublish", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(UnpublishProgramParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const existing = await findOwned(user.id, programId);
  if (!existing) {
    notFound(res);
    return;
  }

  const [program] = await db
    .update(programsTable)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(programsTable.id, existing.id))
    .returning(programColumns);

  if (!program) {
    notFound(res);
    return;
  }

  const lessons = await loadLessons(program.id);
  res.json(UnpublishProgramResponse.parse(toMyProgram(program, lessons)));
});

router.get("/programs/:id", async (req, res) => {
  const programId = readId(GetPublishedProgramParams, req.params, res);
  if (programId === undefined) {
    return;
  }

  const [payload] = await publicPrograms(eq(programsTable.id, programId));
  if (!payload) {
    notFound(res);
    return;
  }
  res.json(GetPublishedProgramResponse.parse(payload));
});

export default router;
