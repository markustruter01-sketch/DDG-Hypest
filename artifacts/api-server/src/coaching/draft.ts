import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { eq, lt } from "drizzle-orm";
import { db, onboardingDraftsTable } from "@workspace/db";
import { checkAnswers, saveProfile } from "./profile";
import { logger } from "../lib/logger";

/** Onboarding answers before signup (build plan 1.4): held server-side under an httpOnly cookie, so the
 *  signup page can open anywhere (a new tab, after an email check) and the plan is still waiting. */
export const DRAFT_COOKIE = "hypest_draft";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const hash = (raw: Buffer) => createHash("sha256").update(raw).digest("hex");

function cookieOptions(expires?: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", ...(expires ? { expires } : {}) };
}

function tokenHash(req: Request): string | null {
  const value = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[DRAFT_COOKIE];
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const raw = Buffer.from(value, "base64url");
  return raw.length === 32 ? hash(raw) : null;
}

/** Save (or replace) this browser's draft. Same checks as a member's own profile save. */
export async function saveDraft(req: Request, res: Response, answers: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const checked = checkAnswers(answers);
  if (!checked.ok) return checked;
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const existing = tokenHash(req);
  if (existing) {
    const updated = await db.update(onboardingDraftsTable).set({ answers, expiresAt }).where(eq(onboardingDraftsTable.tokenHash, existing)).returning({ id: onboardingDraftsTable.id });
    if (updated.length) return { ok: true };
  }
  const raw = randomBytes(32);
  await db.insert(onboardingDraftsTable).values({ tokenHash: hash(raw), answers, expiresAt });
  res.cookie(DRAFT_COOKIE, raw.toString("base64url"), cookieOptions(expiresAt));
  return { ok: true };
}

/** At signup or login: this browser's draft becomes the member's training profile. Never throws; a stale
 *  or invalid draft is simply dropped (the member answers again from Today). */
export async function claimDraft(req: Request, res: Response, userId: number): Promise<boolean> {
  const h = tokenHash(req);
  if (!h) return false;
  res.clearCookie(DRAFT_COOKIE, cookieOptions());
  try {
    const [row] = await db.delete(onboardingDraftsTable).where(eq(onboardingDraftsTable.tokenHash, h)).returning();
    if (!row || row.expiresAt < new Date()) return false;
    const checked = checkAnswers(row.answers);
    if (!checked.ok) return false;
    await saveProfile(userId, checked.values);
    return true;
  } catch (err) {
    logger.warn({ err }, "onboarding draft not claimed");
    return false;
  }
}

export async function deleteExpiredDrafts(now = new Date()): Promise<number> {
  return (await db.delete(onboardingDraftsTable).where(lt(onboardingDraftsTable.expiresAt, now)).returning({ id: onboardingDraftsTable.id })).length;
}
