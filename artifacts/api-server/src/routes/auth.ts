import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetCurrentUserResponse,
  LoginBody,
  LoginResponse,
  SignupBody,
  SignupResponse,
  UpdateCurrentUserBody,
  UpdateCurrentUserResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from "../lib/login-rate-limit";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { isLive, readReferralCookie } from "../lib/referral";
import { isReservedHandle } from "../lib/handles";
import { isUniqueViolation } from "../lib/db-errors";
import {
  authUserColumns,
  clearSessionCookie,
  createSession,
  deleteSessionFromRequest,
  type AuthUser,
} from "../lib/session";
import { authUser, requireUser } from "../middleware/require-user";
import { sendEmail, siteUrl } from "../lib/email";

const router: IRouter = Router();

const DUMMY_PASSWORD_HASH = `scrypt:${"00".repeat(16)}:${"00".repeat(64)}`;

function invalidBodyMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "invalid request";
}

function toCurrentUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    bio: user.bio,
    handle: user.handle,
  };
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidBodyMessage(parsed.error.issues) });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const cookieClick = readReferralCookie(req);
  const referral = cookieClick && isLive(cookieClick, new Date()) ? cookieClick : null;
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        displayName: parsed.data.display_name,
        bio: null,
        adultConfirmedAt: new Date(),
        ...(referral ? { referredByCreatorId: referral.creatorId, referredAt: referral.at } : {}),
      })
      .returning(authUserColumns);

    if (!user) {
      throw new Error("signup insert returned no row");
    }

    await createSession(res, user.id);
    // Welcome email (only when email is set up). Not awaited: signup never waits on the mail server.
    const site = siteUrl();
    if (site) void sendEmail(user.email, "Welcome to Hypest", `Hi ${user.displayName},\n\nYour account is ready. Pick up where you left off: ${site}\n\nForgot your password one day? Use \"Forgot password?\" on the log-in page.`);
    res.status(201).json(SignupResponse.parse(toCurrentUser(user)));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ message: "email already registered" });
      return;
    }
    throw err;
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidBodyMessage(parsed.error.issues) });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  if (await isLoginRateLimited(email)) {
    res.status(429).json({ message: "too many attempts" });
    return;
  }

  const [user] = await db
    .select({ ...authUserColumns, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const passwordOk = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordOk) {
    await recordLoginFailure(email);
    res.status(401).json({ message: "invalid email or password" });
    return;
  }

  await clearLoginFailures(email);
  await createSession(res, user.id);
  res.json(LoginResponse.parse(toCurrentUser(user)));
});

router.post("/auth/logout", async (req, res) => {
  await deleteSessionFromRequest(req);
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", requireUser, (req, res) => {
  const user = authUser(res);
  res.json(GetCurrentUserResponse.parse(toCurrentUser(user)));
});

router.patch("/auth/me", requireUser, async (req, res) => {
  const user = authUser(res);

  const parsed = UpdateCurrentUserBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidBodyMessage(parsed.error.issues) });
    return;
  }

  const changes: { displayName?: string; bio?: string | null; handle?: string } = {};
  if (parsed.data.display_name !== undefined) {
    changes.displayName = parsed.data.display_name;
  }
  if (parsed.data.bio !== undefined) {
    changes.bio = parsed.data.bio;
  }
  if (parsed.data.handle !== undefined && parsed.data.handle !== user.handle) {
    // Set once: changing it would break links creators have already shared.
    if (user.handle !== null) {
      res.status(409).json({ message: "link already set" });
      return;
    }
    if (isReservedHandle(parsed.data.handle)) {
      res.status(409).json({ message: "link name taken" });
      return;
    }
    changes.handle = parsed.data.handle;
  }

  if (Object.keys(changes).length === 0) {
    res.json(UpdateCurrentUserResponse.parse(toCurrentUser(user)));
    return;
  }

  let updated: AuthUser | undefined;
  try {
    [updated] = await db
      .update(usersTable)
      .set(changes)
      .where(eq(usersTable.id, user.id))
      .returning(authUserColumns);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ message: "link name taken" });
      return;
    }
    throw err;
  }

  if (!updated) {
    res.status(401).json({ message: "unauthorized" });
    return;
  }

  res.json(UpdateCurrentUserResponse.parse(toCurrentUser(updated)));
});

export default router;
