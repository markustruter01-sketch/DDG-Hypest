import { lt } from "drizzle-orm";
import { db, passwordResetsTable, sessionsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Deletes expired logins and reset links. Runs at every start; the published app scales to zero when idle,
 * so starts are frequent enough to keep these tables small without a scheduler. Never throws.
 * (Old failed-login rows are cleared by login-rate-limit.ts.)
 */
export async function tidyExpired(): Promise<void> {
  try {
    const now = new Date();
    const sessions = await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, now)).returning({ id: sessionsTable.id });
    const resets = await db.delete(passwordResetsTable).where(lt(passwordResetsTable.expiresAt, now)).returning({ id: passwordResetsTable.id });
    logger.info({ sessions: sessions.length, resets: resets.length }, "expired rows deleted");
  } catch (err) {
    logger.warn({ err }, "tidy failed");
  }
}
