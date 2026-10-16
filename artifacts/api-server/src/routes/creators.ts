import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { GetCreatorParams, GetCreatorResponse, RecordCreatorVisitParams } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { userFromRequest } from "../lib/session";
import { writeReferralCookie } from "../lib/referral";

const router: IRouter = Router();

async function creatorByHandle(handle: string) {
  const [creator] = await db
    .select({ id: usersTable.id, handle: usersTable.handle, displayName: usersTable.displayName, bio: usersTable.bio })
    .from(usersTable)
    .where(eq(usersTable.handle, handle))
    .limit(1);
  return creator && creator.handle !== null ? { ...creator, handle: creator.handle } : null;
}

router.get("/creators/:handle", async (req, res) => {
  const params = GetCreatorParams.safeParse(req.params);
  const creator = params.success ? await creatorByHandle(params.data.handle) : null;
  if (!creator) {
    res.status(404).json({ message: "not found" });
    return;
  }
  res.json(GetCreatorResponse.parse({ handle: creator.handle, display_name: creator.displayName, bio: creator.bio }));
});

// A visit through a creator's link. Last link wins; the creator's own visits are ignored.
router.post("/creators/:handle/visit", async (req, res) => {
  const params = RecordCreatorVisitParams.safeParse(req.params);
  const creator = params.success ? await creatorByHandle(params.data.handle) : null;
  if (!creator) {
    res.status(404).json({ message: "not found" });
    return;
  }
  const visitor = await userFromRequest(req);
  if (visitor?.id === creator.id) {
    res.status(204).end();
    return;
  }
  const click = { creatorId: creator.id, at: new Date() };
  writeReferralCookie(res, click);
  if (visitor) {
    await db
      .update(usersTable)
      .set({ referredByCreatorId: click.creatorId, referredAt: click.at })
      .where(eq(usersTable.id, visitor.id));
  }
  res.status(204).end();
});

export default router;
