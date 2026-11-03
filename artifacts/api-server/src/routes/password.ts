import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { ChangePasswordBody, ForgotPasswordBody, ResetPasswordBody, ResetPasswordResponse } from "@workspace/api-zod";
import { authFailuresTable, db, passwordResetsTable, sessionsTable, usersTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { authUserColumns, createSession } from "../lib/session";
import { emailOn, sendEmail, siteUrl, SUPPORT_EMAIL } from "../lib/email";
import { allowIp } from "../lib/ip-limit";

const router: IRouter = Router();

const LINK_TTL_MS = 60 * 60 * 1000; // a reset link works for one hour
const LINKS_PER_HOUR = 3; // per account: stops anyone flooding someone's inbox
const SENT = "If that email has a Hypest account, a reset link is on its way. It works for one hour.";

const sha256 = (raw: Buffer) => createHash("sha256").update(raw).digest("hex");
const bad = (issues: { message: string }[]) => ({ message: issues[0]?.message ?? "invalid request" });

router.put("/auth/password", requireUser, async (req, res) => {
  const body = ChangePasswordBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json(bad(body.error.issues));
  const user = authUser(res);
  const [row] = await db.select({ hash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, user.id));
  if (!row || !(await verifyPassword(body.data.current_password, row.hash))) return void res.status(403).json({ message: "Current password is wrong" });
  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ passwordHash: await hashPassword(body.data.new_password) }).where(eq(usersTable.id, user.id));
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));
  });
  await createSession(res, user.id); // this device stays logged in; every other one is logged out
  res.status(204).end();
});

router.post("/auth/password/forgot", async (req, res) => {
  const body = ForgotPasswordBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json(bad(body.error.issues));
  if (!(await allowIp(req, res, "reset"))) return;
  const site = siteUrl();
  if (!emailOn() || !site) return void res.status(503).json({ message: `Password reset by email isn't set up yet. Email ${SUPPORT_EMAIL} and we'll help.` });

  const email = body.data.email.toLowerCase();
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (user) {
    const [recent] = await db
      .select({ n: count() })
      .from(passwordResetsTable)
      .where(and(eq(passwordResetsTable.userId, user.id), gt(passwordResetsTable.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
    if ((recent?.n ?? 0) < LINKS_PER_HOUR) {
      const raw = randomBytes(32);
      await db.transaction(async (tx) => {
        // Only the newest link works.
        await tx.update(passwordResetsTable).set({ usedAt: new Date() }).where(and(eq(passwordResetsTable.userId, user.id), isNull(passwordResetsTable.usedAt)));
        await tx.insert(passwordResetsTable).values({ userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + LINK_TTL_MS) });
      });
      const link = `${site}/reset?token=${raw.toString("base64url")}`;
      await sendEmail(email, "Reset your Hypest password", `Tap the link to set a new password. It works once, for one hour:\n\n${link}\n\nDidn't ask for this? Ignore this email; your password stays the same.`);
    }
  }
  // Same answer either way, so nobody can use this to find out who has an account.
  res.status(202).json({ message: SENT });
});

router.post("/auth/password/reset", async (req, res) => {
  const body = ResetPasswordBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json(bad(body.error.issues));
  if (!(await allowIp(req, res, "reset"))) return;
  if (!/^[A-Za-z0-9_-]{43}$/.test(body.data.token)) return void res.status(400).json({ message: "This link isn't valid." });
  const tokenHash = sha256(Buffer.from(body.data.token, "base64url"));
  const [link] = await db.select().from(passwordResetsTable).where(eq(passwordResetsTable.tokenHash, tokenHash));
  if (!link || link.usedAt || link.expiresAt.getTime() <= Date.now()) {
    return void res.status(400).json({ message: "This link has expired or was already used. Ask for a new one." });
  }
  const passwordHash = await hashPassword(body.data.password);
  const used = await db.transaction(async (tx) => {
    const marked = await tx
      .update(passwordResetsTable)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetsTable.id, link.id), isNull(passwordResetsTable.usedAt)))
      .returning({ id: passwordResetsTable.id });
    if (!marked.length) return false; // a second tap at the same moment
    await tx.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, link.userId));
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, link.userId));
    return true;
  });
  if (!used) return void res.status(400).json({ message: "This link has expired or was already used. Ask for a new one." });
  const [user] = await db.select(authUserColumns).from(usersTable).where(eq(usersTable.id, link.userId));
  if (!user) return void res.status(400).json({ message: "This link isn't valid." });
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, user.email));
  await createSession(res, user.id);
  res.json(ResetPasswordResponse.parse({ id: user.id, email: user.email, display_name: user.displayName, handle: user.handle, timezone: user.timezone }));
});

export default router;
