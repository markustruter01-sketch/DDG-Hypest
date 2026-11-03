import { and, count, eq, gt, lt } from "drizzle-orm";
import { authFailuresTable, db } from "@workspace/db";

/**
 * 10 failed logins for one email from one network in 15 minutes, then that email waits ON THAT NETWORK.
 * The member's own phone or home network is unaffected, so a stranger cannot lock them out.
 * (Guessing from many networks is held back by the per-network limits in ip-limit.ts.)
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const cutoff = () => new Date(Date.now() - WINDOW_MS);

export async function isLoginRateLimited(email: string, ip: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(authFailuresTable)
    .where(and(eq(authFailuresTable.email, email), eq(authFailuresTable.ip, ip), gt(authFailuresTable.at, cutoff())));
  return (row?.n ?? 0) >= MAX_FAILURES;
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await db.insert(authFailuresTable).values({ email, ip });
  await db.delete(authFailuresTable).where(lt(authFailuresTable.at, cutoff()));
}

export async function clearLoginFailures(email: string): Promise<void> {
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, email));
}
