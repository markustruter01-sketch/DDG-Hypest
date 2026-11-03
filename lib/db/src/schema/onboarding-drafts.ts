import { jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Onboarding answers given before the account exists (build plan 1.4). Keyed by the SHA-256 of a random
 * token held in an httpOnly cookie, so they survive the signup page opening in a new tab; claimed (saved as
 * the member's training profile and deleted) at signup or login. Expire after a day.
 */
export const onboardingDraftsTable = pgTable(
  "onboarding_drafts",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    answers: jsonb("answers").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("onboarding_drafts_token_unique").on(table.tokenHash)],
);
