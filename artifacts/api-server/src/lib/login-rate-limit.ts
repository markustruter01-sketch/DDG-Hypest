import { and, count, eq, gt, lt } from "drizzle-orm";
import { authFailuresTable, db } from "@workspace/db";

/** 10 failed logins per email in 15 minutes, then that email waits. Stored in the database. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const cutoff = () => new Date(Date.now() - WINDOW_MS);

export async function isLoginRateLimited(email: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(authFailuresTable)
    .where(and(eq(authFailuresTable.email, email), gt(authFailuresTable.at, cutoff())));
  return (row?.n ?? 0) >= MAX_FAILURES;
}

export async function recordLoginFailure(email: string): Promise<void> {
  await db.insert(authFailuresTable).values({ email });
  await db.delete(authFailuresTable).where(lt(authFailuresTable.at, cutoff()));
}

export async function clearLoginFailures(email: string): Promise<void> {
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, email));
}
