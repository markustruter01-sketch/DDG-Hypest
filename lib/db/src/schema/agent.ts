import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/**
 * The coach agent (build plan phase 2, docs/COACH-AGENT-SPEC.md). Every number lives in `allowances`, seeded at
 * start-up from coaching/allowance.ts and then edited only there (or in this table by Markus).
 */

/** How many AI turns of each kind a tier gets. 0 = none. (Spec §5.) */
export const allowancesTable = pgTable(
  "allowances",
  {
    tier: text("tier").notNull(),
    kind: text("kind").notNull(),
    perDay: integer("per_day").notNull(),
    perMonth: integer("per_month").notNull(),
  },
  (table) => [primaryKey({ columns: [table.tier, table.kind] })],
);

/** One row per member per UTC month: AI cost and calls, reserved atomically before each turn. (Spec §7.) */
export const aiLedgerMonthlyTable = pgTable(
  "ai_ledger_monthly",
  {
    userId: integer("user_id").notNull().references(() => usersTable.id),
    month: text("month").notNull(),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    callsChat: integer("calls_chat").notNull().default(0),
    callsDailyNote: integer("calls_daily_note").notNull().default(0),
    callsPlanNotes: integer("calls_plan_notes").notNull().default(0),
    callsWeeklyReview: integer("calls_weekly_review").notNull().default(0),
    callsCheckin: integer("calls_checkin").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.month] })],
);

/** One row per member per local day per kind. Rows older than 40 days are tidied. (Spec §7.) */
export const aiLedgerDailyTable = pgTable(
  "ai_ledger_daily",
  {
    userId: integer("user_id").notNull().references(() => usersTable.id),
    day: text("day").notNull(),
    kind: text("kind").notNull(),
    calls: integer("calls").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day, table.kind] })],
);

/** What the coach remembers about a member. Member-visible and deletable on Me. Never health details. (Spec §4.) */
export const coachMemoryTable = pgTable(
  "coach_memory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("coach_memory_user").on(table.userId),
    check("coach_memory_kind", sql`${table.kind} in ('preference', 'schedule', 'equipment', 'goal_detail', 'motivation')`),
    check("coach_memory_source", sql`${table.source} in ('agent', 'member')`),
    check("coach_memory_text", sql`char_length(${table.text}) between 1 and 200`),
  ],
);

/** Every tool call and filter drop: ids touched and the result only, never member or model text. Kept 180 days. */
export const agentActionsTable = pgTable(
  "agent_actions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    turnId: text("turn_id").notNull(),
    tool: text("tool").notNull(),
    touched: jsonb("touched").notNull(),
    result: jsonb("result").notNull(),
    promptVersion: text("prompt_version").notNull(),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [index("agent_actions_user_at").on(table.userId, table.at), index("agent_actions_at").on(table.at)],
);

/** A coach message the member asked for on a later day ("check in with me Friday"). (Spec §3.) */
export const checkinsTable = pgTable(
  "checkins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    dueAt: timestamp("due_at").notNull(),
    topic: text("topic").notNull(),
    status: text("status").notNull().default("pending"),
    messageId: integer("message_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("checkins_due").on(table.status, table.dueAt),
    check("checkins_status", sql`${table.status} in ('pending', 'sent', 'cancelled')`),
  ],
);

/** The Sunday review: one per member per local week (the Monday it belongs to). (Step 2.5.) */
export const weeklyReviewsTable = pgTable(
  "weekly_reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    weekOf: text("week_of").notNull(),
    status: text("status").notNull(),
    messageId: integer("message_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("weekly_reviews_user_week").on(table.userId, table.weekOf),
    check("weekly_reviews_status", sql`${table.status} in ('working', 'done', 'skipped', 'failed')`),
  ],
);
