import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { DeleteAccountBody } from "@workspace/api-zod";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { clearSessionCookie } from "../lib/session";
import { verifyPassword } from "../lib/passwords";
import { stripeClient } from "../lib/stripe";
import { activeSubscriptionIds, deleteAccount } from "../account/delete";
import { exportAccount } from "../account/export";

const router: IRouter = Router();

router.post("/auth/logout-all", requireUser, async (_req, res) => {
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, authUser(res).id));
  clearSessionCookie(res);
  res.status(204).end();
});

router.delete("/auth/me", requireUser, async (req, res) => {
  const body = DeleteAccountBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  const user = authUser(res);
  const [row] = await db.select({ hash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, user.id));
  if (!row || !(await verifyPassword(body.data.password, row.hash))) return void res.status(403).json({ message: "Wrong password" });

  const stripe = stripeClient();
  if (!stripe && (await activeSubscriptionIds(user.id)).length) {
    return void res.status(503).json({ message: "Your membership can't be cancelled right now, so nothing was deleted. Try again later." });
  }
  try {
    await deleteAccount(user.id, stripe ? async (id) => void (await stripe.subscriptions.cancel(id)) : null);
  } catch (err) {
    req.log.error({ err }, "account delete failed");
    return void res.status(502).json({ message: "Your membership couldn't be cancelled, so nothing was deleted. Try again in a minute." });
  }
  req.log.info({ user: user.id }, "account deleted");
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me/export", requireUser, async (_req, res) => {
  const data = await exportAccount(authUser(res).id);
  res.set("Content-Disposition", 'attachment; filename="hypest-my-data.json"');
  res.json(data);
});

export default router;
