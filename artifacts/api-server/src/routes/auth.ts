import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetCurrentUserResponse,
  LoginBody,
  LoginResponse,
  SignupBody,
  SignupResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from "../lib/login-rate-limit";
import { hashPassword, verifyPassword } from "../lib/passwords";
import {
  clearSessionCookie,
  createSession,
  deleteSessionFromRequest,
  type AuthUser,
} from "../lib/session";
import { requireUser } from "../middleware/require-user";

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
  };
}

function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: invalidBodyMessage(parsed.error.issues) });
    return;
  }

  const email = parsed.data.email.toLowerCase();
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
      })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        bio: usersTable.bio,
      });

    if (!user) {
      throw new Error("signup insert returned no row");
    }

    await createSession(res, user.id);
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
  if (isLoginRateLimited(email)) {
    res.status(429).json({ message: "too many attempts" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      bio: usersTable.bio,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const passwordOk = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordOk) {
    recordLoginFailure(email);
    res.status(401).json({ message: "invalid email or password" });
    return;
  }

  clearLoginFailures(email);
  await createSession(res, user.id);
  res.json(LoginResponse.parse(toCurrentUser(user)));
});

router.post("/auth/logout", async (req, res) => {
  await deleteSessionFromRequest(req);
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", requireUser, (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: "unauthorized" });
    return;
  }
  res.json(GetCurrentUserResponse.parse(toCurrentUser(user)));
});

export default router;
