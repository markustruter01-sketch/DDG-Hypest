import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { devUserId, setDevGuest } from "./dev-login";

export const SESSION_COOKIE = "hypest_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: number;
  email: string;
  displayName: string;
  bio: string | null;
  handle: string | null;
};

/** Single source for the user fields the API loads for a logged-in user. */
export const authUserColumns = {
  id: usersTable.id,
  email: usersTable.email,
  displayName: usersTable.displayName,
  bio: usersTable.bio,
  handle: usersTable.handle,
};

declare global {
  namespace Express {
    interface Locals {
      authUser?: AuthUser;
    }
  }
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

function readCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[SESSION_COOKIE];
  return typeof value === "string" ? value : undefined;
}

/** Cookie value is base64url of the raw token. The database stores SHA-256 of those raw bytes. */
function tokenHashFromCookie(cookieValue: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) {
    return null;
  }
  const raw = Buffer.from(cookieValue, "base64url");
  if (raw.length !== 32) {
    return null;
  }
  return createHash("sha256").update(raw).digest("hex");
}

export async function createSession(res: Response, userId: number): Promise<void> {
  const raw = randomBytes(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: createHash("sha256").update(raw).digest("hex"),
    expiresAt,
  });
  res.cookie(SESSION_COOKIE, raw.toString("base64url"), cookieOptions(expiresAt));
  setDevGuest(res, false);
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  setDevGuest(res, true);
}

export async function deleteSessionFromRequest(req: Request): Promise<void> {
  const cookieValue = readCookie(req);
  if (!cookieValue) {
    return;
  }
  const tokenHash = tokenHashFromCookie(cookieValue);
  if (!tokenHash) {
    return;
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, tokenHash));
}

export async function userFromRequest(req: Request): Promise<AuthUser | null> {
  const user = await sessionUser(req);
  if (user) {
    return user;
  }
  const devId = await devUserId(req);
  if (devId === null) {
    return null;
  }
  const [dev] = await db.select(authUserColumns).from(usersTable).where(eq(usersTable.id, devId)).limit(1);
  return dev ?? null;
}

async function sessionUser(req: Request): Promise<AuthUser | null> {
  const cookieValue = readCookie(req);
  if (!cookieValue) {
    return null;
  }
  const tokenHash = tokenHashFromCookie(cookieValue);
  if (!tokenHash) {
    return null;
  }

  const [session] = await db
    .select({
      id: sessionsTable.id,
      userId: sessionsTable.userId,
      expiresAt: sessionsTable.expiresAt,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.tokenHash, tokenHash))
    .limit(1);

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }

  const [user] = await db
    .select(authUserColumns)
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  if (!user) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }

  return user;
}
