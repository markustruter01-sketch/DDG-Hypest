import { and, count, eq, gt, lt } from "drizzle-orm";
import { authFailuresTable, db } from "@workspace/db";
import { alert } from "./alerts";

/**
 * 10 failed logins for one email from one network in 15 minutes, then that email waits ON THAT NETWORK.
 * The member's own phone or home network is unaffected, so a stranger cannot lock them out.
 * (Guessing from many networks is held back by the per-network limits in ip-limit.ts.)
 * Backstop (build plan 1.11): 100 failures for one email from ANY networks in 15 minutes locks that email for
 * everyone until the window passes, and alerts Markus once: that many is an attack, not a forgotten password.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
export const MAX_FAILURES_ALL_NETWORKS = 100;

const cutoff = () => new Date(Date.now() - WINDOW_MS);

async function failures(email: string, ip?: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(authFailuresTable)
    .where(and(eq(authFailuresTable.email, email), ip === undefined ? undefined : eq(authFailuresTable.ip, ip), gt(authFailuresTable.at, cutoff())));
  return row?.n ?? 0;
}

export async function isLoginRateLimited(email: string, ip: string): Promise<boolean> {
  if ((await failures(email, ip)) >= MAX_FAILURES) return true;
  return (await failures(email)) >= MAX_FAILURES_ALL_NETWORKS;
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await db.insert(authFailuresTable).values({ email, ip });
  await db.delete(authFailuresTable).where(lt(authFailuresTable.at, cutoff()));
  // At or over the limit: failures that arrive together can step past 100 without any of them seeing exactly 100.
  // alert() sends the same title at most once per 10 minutes, so an attack is one message. No email in the chat.
  if ((await failures(email)) >= MAX_FAILURES_ALL_NETWORKS) {
    void alert("warning", "Login attack on one account", `${MAX_FAILURES_ALL_NETWORKS} failed logins for one email from many networks in 15 minutes. That email is locked for everyone for 15 minutes.`);
  }
}

export async function clearLoginFailures(email: string): Promise<void> {
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, email));
}
