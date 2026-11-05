import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/**
 * One row per AI call (the Claude API). Cost is worked out from the token counts Anthropic returns and the
 * prices in artifacts/api-server/src/lib/ai.ts, in millionths of a US dollar. The monthly budget check
 * adds these up, so AI stops (and the rules engine carries on) once the month's budget is spent.
 */
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at").notNull().defaultNow(),
    userId: integer("user_id").references(() => usersTable.id),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicroUsd: integer("cost_micro_usd").notNull(),
    ok: boolean("ok").notNull(),
    // The allowance kind the call counted against (spec §5); null on rows from before phase 2.
    kind: text("kind"),
    promptVersion: text("prompt_version"),
  },
  (table) => [
    index("ai_usage_at").on(table.at),
    index("ai_usage_user_at").on(table.userId, table.at),
    check("ai_usage_purpose", sql`${table.purpose} in ('plan_notes', 'chat', 'daily_note', 'weekly_review', 'checkin', 'meal_log', 'meal_plan', 'midweek_check', 'monthly_report')`),
  ],
);

/** Coach chat (Coaching members). role: member = what they wrote, coach = the reply shown to them. */
export const coachMessagesTable = pgTable(
  "coach_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    coachId: text("coach_id").notNull(),
    role: text("role").notNull(),
    text: text("text").notNull(),
    // 'ai' = written by Claude; 'safety' = the fixed stop message (no AI call was made); 'fixed' = a fixed coach line
    // (limit reached, fallback); 'daily_note', 'checkin', 'weekly_review' = written by those agent jobs.
    source: text("source"),
    // A proposal the member can accept with one tap: 'build_block' (spec §3). Null for ordinary messages.
    action: text("action"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("coach_messages_user").on(table.userId, table.createdAt),
    check("coach_messages_role", sql`${table.role} in ('member', 'coach')`),
    check("coach_messages_text", sql`char_length(${table.text}) between 1 and 2000`),
  ],
);
