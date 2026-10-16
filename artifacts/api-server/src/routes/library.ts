import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  GetLibraryProgramParams,
  GetLibraryProgramResponse,
  ListLibraryResponse,
  TestPurchaseParams,
  TestPurchaseResponse,
} from "@workspace/api-zod";
import { commissionRatesTable, db, programsTable, purchasesTable, usersTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { devToolsOn } from "../lib/dev-login";
import { isUniqueViolation } from "../lib/db-errors";
import { commissionSource, readReferralCookie } from "../lib/referral";
import { loadLessons, publicPrograms, readId, toLesson } from "./programs";

const router: IRouter = Router();

router.get("/library", requireUser, async (_req, res) => {
  const user = authUser(res);
  const owned = await db
    .select({ programId: purchasesTable.programId })
    .from(purchasesTable)
    .where(eq(purchasesTable.buyerId, user.id))
    .orderBy(desc(purchasesTable.createdAt), desc(purchasesTable.id));
  const ids = owned.map((row) => row.programId);
  const cards = ids.length === 0 ? [] : await publicPrograms(inArray(programsTable.id, ids), true);
  const byId = new Map(cards.map((card) => [card.id, card]));
  res.json(ListLibraryResponse.parse(ids.flatMap((id) => byId.get(id) ?? [])));
});

// Lessons are only sent to the program's creator or someone who bought it.
router.get("/library/:id", requireUser, async (req, res) => {
  const user = authUser(res);
  const programId = readId(GetLibraryProgramParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const [program] = await db
    .select({
      id: programsTable.id,
      creatorId: programsTable.creatorId,
      title: programsTable.title,
      description: programsTable.description,
      creatorDisplayName: usersTable.displayName,
      creatorHandle: usersTable.handle,
    })
    .from(programsTable)
    .innerJoin(usersTable, eq(usersTable.id, programsTable.creatorId))
    .where(eq(programsTable.id, programId))
    .limit(1);
  if (!program) {
    res.status(404).json({ message: "not found" });
    return;
  }
  const isCreator = program.creatorId === user.id;
  if (!isCreator) {
    const [bought] = await db
      .select({ id: purchasesTable.id })
      .from(purchasesTable)
      .where(and(eq(purchasesTable.buyerId, user.id), eq(purchasesTable.programId, program.id)))
      .limit(1);
    if (!bought) {
      res.status(403).json({ message: "not bought" });
      return;
    }
  }
  const lessons = await loadLessons(program.id);
  res.json(
    GetLibraryProgramResponse.parse({
      id: program.id,
      title: program.title,
      description: program.description,
      creator_display_name: program.creatorDisplayName,
      creator_handle: program.creatorHandle,
      is_creator: isCreator,
      lessons: lessons.map(toLesson),
    }),
  );
});

// DEVELOPMENT ONLY: records a purchase with no payment, using the real commission rule,
// so access, the library and the player can be tested before Stripe exists.
router.post("/programs/:id/test-purchase", requireUser, async (req, res) => {
  if (!devToolsOn()) {
    res.status(404).json({ message: "not found" });
    return;
  }
  const user = authUser(res);
  const programId = readId(TestPurchaseParams, req.params, res);
  if (programId === undefined) {
    return;
  }
  const [program] = await db
    .select({ id: programsTable.id, creatorId: programsTable.creatorId, priceCents: programsTable.priceCents })
    .from(programsTable)
    .where(and(eq(programsTable.id, programId), eq(programsTable.status, "published")))
    .limit(1);
  if (!program) {
    res.status(404).json({ message: "not found" });
    return;
  }
  if (program.creatorId === user.id) {
    res.status(400).json({ message: "this is your own program" });
    return;
  }

  const [buyer] = await db
    .select({ referredByCreatorId: usersTable.referredByCreatorId, referredAt: usersTable.referredAt })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);
  const accountClick =
    buyer?.referredByCreatorId != null && buyer.referredAt != null
      ? { creatorId: buyer.referredByCreatorId, at: buyer.referredAt }
      : null;
  const source = commissionSource({
    programCreatorId: program.creatorId,
    cookieClick: readReferralCookie(req),
    accountClick,
    now: new Date(),
  });
  const [rate] = await db
    .select({ bps: commissionRatesTable.commissionBps })
    .from(commissionRatesTable)
    .where(eq(commissionRatesTable.source, source))
    .limit(1);
  if (!rate) {
    throw new Error(`commission rate missing for ${source}`);
  }

  try {
    await db.insert(purchasesTable).values({
      buyerId: user.id,
      programId: program.id,
      priceCents: program.priceCents,
      commissionSource: source,
      commissionBps: rate.bps,
      status: "test",
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ message: "already yours" });
      return;
    }
    throw err;
  }

  res.status(201).json(
    TestPurchaseResponse.parse({
      program_id: program.id,
      price_cents: program.priceCents,
      commission_source: source,
      commission_bps: rate.bps,
      status: "test",
    }),
  );
});

export default router;
