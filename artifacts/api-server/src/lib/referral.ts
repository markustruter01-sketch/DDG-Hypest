import type { Request, Response } from "express";

/**
 * Creator-link attribution (decided by Markus, 17 Oct 2026):
 * - A buyer who arrives through a creator's link is "creator_brought" for that
 *   creator's programs for 30 days. Anything else is "hypest_found".
 * - Last link wins. The click is kept in a cookie and, once the buyer has an
 *   account, on the account too (so a different device still counts).
 */
export const REFERRAL_WINDOW_DAYS = 30;
const WINDOW_MS = REFERRAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const COOKIE = "hypest_ref";

export type ReferralClick = { creatorId: number; at: Date };
export type CommissionSource = "creator_brought" | "hypest_found";

/** Cookie value: "<creatorId>.<clickedAtMs>". Not secret: a buyer gains nothing by editing it. */
export function readReferralCookie(req: Request): ReferralClick | null {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[COOKIE];
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{1,10})\.(\d{13})$/.exec(value);
  if (!match) {
    return null;
  }
  const at = new Date(Number(match[2]));
  return { creatorId: Number(match[1]), at };
}

export function writeReferralCookie(res: Response, click: ReferralClick): void {
  res.cookie(COOKIE, `${click.creatorId}.${click.at.getTime()}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WINDOW_MS,
  });
}

/** True if the click happened within the window before `now` (and not in the future). */
export function isLive(click: ReferralClick, now: Date): boolean {
  const age = now.getTime() - click.at.getTime();
  return age >= 0 && age <= WINDOW_MS;
}

/** The newer of two clicks (either may be missing). */
export function latestClick(a: ReferralClick | null, b: ReferralClick | null): ReferralClick | null {
  if (!a) return b;
  if (!b) return a;
  return a.at.getTime() >= b.at.getTime() ? a : b;
}

/**
 * Which commission rate applies to a sale. Used by checkout.
 * Only the most recent live click counts, and only for that creator's own programs.
 */
export function commissionSource(input: {
  programCreatorId: number;
  cookieClick: ReferralClick | null;
  accountClick: ReferralClick | null;
  now: Date;
}): CommissionSource {
  const live = [input.cookieClick, input.accountClick].filter(
    (c): c is ReferralClick => c !== null && isLive(c, input.now),
  );
  const last = live.reduce<ReferralClick | null>((best, c) => latestClick(best, c), null);
  return last?.creatorId === input.programCreatorId ? "creator_brought" : "hypest_found";
}
