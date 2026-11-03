import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * DEVELOPMENT ONLY (also gates the other dev tools, e.g. test purchases): with no session, act as a fixed "Dev Creator" account so
 * Markus doesn't have to log in on every preview.
 * Two gates: NODE_ENV must be "development" (production runs set "production")
 * AND DEV_AUTO_LOGIN must be "1" (set only by the api-server dev:local script and the local checks; never on Replit, see devLoginProblem).
 * Log out sets a cookie that turns it off, so the logged-out screens can still be tested.
 */
const DEV_EMAIL = "dev@hypest.test";
const GUEST_COOKIE = "hypest_dev_guest";
// Not a valid scrypt hash, so nobody can log in to this account with a password.
const NO_PASSWORD = "disabled";

export function devToolsOn(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_AUTO_LOGIN === "1";
}

/** Signs that this server can be reached from the internet (Replit sets these in the workspace and in published apps). */
const PUBLIC_MARKERS = ["REPLIT_DEPLOYMENT", "REPL_ID", "REPLIT_DEV_DOMAIN", "REPLIT_DOMAINS"];

/**
 * Fail closed: why dev auto-login must not start here, or null when it is safe.
 * Checked at start-up (index.ts refuses to start). When dev tools are on, the server also listens on 127.0.0.1 only.
 */
export function devLoginProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env["DEV_AUTO_LOGIN"] !== "1") return null;
  if (env["NODE_ENV"] !== "development") return `DEV_AUTO_LOGIN=1 with NODE_ENV=${env["NODE_ENV"] ?? "(unset)"}: remove DEV_AUTO_LOGIN`;
  const marker = PUBLIC_MARKERS.find((k) => env[k]);
  if (marker) return `DEV_AUTO_LOGIN=1 on a server reachable from the internet (${marker} is set): remove DEV_AUTO_LOGIN`;
  const host = env["HOST"];
  if (host && !["127.0.0.1", "localhost", "::1"].includes(host)) return `DEV_AUTO_LOGIN=1 with HOST=${host}: dev auto-login only runs on localhost`;
  return null;
}

/** Where to listen: this machine only while dev tools are on, every interface otherwise. */
export function listenHost(): string | undefined {
  return devToolsOn() ? "127.0.0.1" : undefined;
}

function wantsGuest(req: Request): boolean {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  return cookies?.[GUEST_COOKIE] === "1";
}

/** Called on logout / login so dev auto-login steps aside or comes back. */
export function setDevGuest(res: Response, guest: boolean): void {
  if (!devToolsOn()) {
    return;
  }
  if (guest) {
    res.cookie(GUEST_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    res.clearCookie(GUEST_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
  }
}

/** The dev account id to act as, or null. Creates the account on first use. */
export async function devUserId(req: Request): Promise<number | null> {
  if (!devToolsOn() || wantsGuest(req)) {
    return null;
  }
  await db
    .insert(usersTable)
    .values({ email: DEV_EMAIL, passwordHash: NO_PASSWORD, displayName: "Dev Creator", adultConfirmedAt: new Date() })
    .onConflictDoNothing({ target: usersTable.email });
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, DEV_EMAIL)).limit(1);
  return user?.id ?? null;
}
