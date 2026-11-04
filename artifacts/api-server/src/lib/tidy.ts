import { lt } from "drizzle-orm";
import { aiLedgerDailyTable, db, passwordResetsTable, sessionsTable } from "@workspace/db";
import { logger } from "./logger";
import { deleteExpiredDrafts } from "../coaching/draft";

/**
 * Deletes expired logins, reset links and onboarding drafts. Runs at every start; the published app scales to zero when idle,
 * so starts are frequent enough to keep these tables small without a scheduler. Never throws.
 * (Old failed-login rows are cleared by login-rate-limit.ts, old per-network attempts by ip-limit.ts.)
 */
export async function tidyExpired(): Promise<void> {
  try {
    const now = new Date();
    const sessions = await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, now)).returning({ id: sessionsTable.id });
    const resets = await db.delete(passwordResetsTable).where(lt(passwordResetsTable.expiresAt, now)).returning({ id: passwordResetsTable.id });
    const drafts = await deleteExpiredDrafts(now);
    // Spec §7: daily AI counts are only needed for "today"; keep 40 days for the cost report.
    const ledger = await db.delete(aiLedgerDailyTable).where(lt(aiLedgerDailyTable.day, new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10))).returning({ d: aiLedgerDailyTable.day });
    logger.info({ sessions: sessions.length, resets: resets.length, drafts, ledgerDays: ledger.length }, "expired rows deleted");
  } catch (err) {
    logger.warn({ err }, "tidy failed");
  }
}
