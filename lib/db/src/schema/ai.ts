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
  },
  (table) => [index("ai_usage_at").on(table.at), check("ai_usage_purpose", sql`${table.purpose} in ('plan_notes', 'chat')`)],
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
    // 'ai' = written by Claude; 'safety' = the fixed stop message (no AI call was made).
    source: text("source"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("coach_messages_user").on(table.userId, table.createdAt),
    check("coach_messages_role", sql`${table.role} in ('member', 'coach')`),
    check("coach_messages_text", sql`char_length(${table.text}) between 1 and 2000`),
  ],
);
