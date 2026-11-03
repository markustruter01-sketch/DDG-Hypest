import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/** Onboarding answers. One row per member; a new plan is built from the latest answers. */
export const trainingProfilesTable = pgTable(
  "training_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    coachId: text("coach_id").notNull(),
    goal: text("goal").notNull(),
    experience: text("experience").notNull(),
    daysPerWeek: integer("days_per_week").notNull(),
    minutes: integer("minutes").notNull(),
    equipment: text("equipment").array().notNull(),
    avoidAreas: text("avoid_areas").array().notNull(),
    units: text("units").notNull().default("kg"),
    healthAcceptedAt: timestamp("health_accepted_at").notNull(),
    /** Health check result (coaching/screening.ts): { version, any_yes, cleared }. Null = never answered. */
    screening: jsonb("screening").$type<{ version: string; any_yes: boolean; cleared: boolean }>(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("training_profiles_user_unique").on(table.userId),
    check("training_profiles_days", sql`${table.daysPerWeek} between 2 and 6`),
    check("training_profiles_minutes", sql`${table.minutes} in (20, 30, 45, 60)`),
    check("training_profiles_units", sql`${table.units} in ('kg', 'lb')`),
  ],
);

/**
 * What a member has paid for. kind: intro_plan (first plan, discounted, once per person),
 * plan (one-off), tier1 (plans subscription), tier2 (plans + coaching + logging).
 * test = no real money moved (a dev-only unlock, or a Stripe test-mode payment).
 * stripe_ref = the Stripe Checkout Session (one-off plans) or Subscription (tier1/tier2) that created the row;
 * null for dev unlocks. Access only ever comes from a verified Stripe webhook (routes/billing.ts).
 */
export const membershipsTable = pgTable(
  "memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    test: boolean("test").notNull().default(false),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
    usedAt: timestamp("used_at"),
    stripeRef: text("stripe_ref"),
    stripePaymentIntent: text("stripe_payment_intent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_stripe_ref_unique").on(table.stripeRef),
    check("memberships_kind", sql`${table.kind} in ('intro_plan', 'plan', 'tier1', 'tier2')`),
    check("memberships_status", sql`${table.status} in ('active', 'ended')`),
  ],
);

/** A 4-week block. engine = how it was built ('rules' today; 'ai' once the AI layer exists). */
export const plansTable = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    coachId: text("coach_id").notNull(),
    block: integer("block").notNull(),
    weeks: integer("weeks").notNull(),
    status: text("status").notNull(),
    engine: text("engine").notNull(),
    pausedReason: text("paused_reason"),
    // The exact inputs and output, kept so any plan can be reviewed later (AI notes included, under record.ai).
    record: jsonb("record").notNull(),
    // The coach's short welcome for this block, written by the AI layer; null when AI is off or failed.
    intro: text("intro"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("plans_status", sql`${table.status} in ('active', 'paused', 'done')`),
    check("plans_engine", sql`${table.engine} in ('rules', 'ai')`),
  ],
);

export const planSessionsTable = pgTable(
  "plan_sessions",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull().references(() => plansTable.id),
    week: integer("week").notNull(),
    day: integer("day").notNull(),
    title: text("title").notNull(),
    // One line from the coach about this session (AI layer); null when AI is off or failed.
    note: text("note"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [uniqueIndex("plan_sessions_slot_unique").on(table.planId, table.week, table.day)],
);

export const planItemsTable = pgTable(
  "plan_items",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => planSessionsTable.id),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").notNull(),
    sets: integer("sets").notNull(),
    reps: integer("reps"),
    seconds: integer("seconds"),
    restSeconds: integer("rest_seconds").notNull(),
    targetLoadKg: real("target_load_kg"),
    swappedFrom: text("swapped_from"),
  },
  (table) => [
    uniqueIndex("plan_items_position_unique").on(table.sessionId, table.position),
    check("plan_items_sets", sql`${table.sets} between 1 and 8`),
    check("plan_items_dose", sql`(${table.reps} is null) <> (${table.seconds} is null)`),
  ],
);

/** Tier 2 logging: one row per set done. */
export const setLogsTable = pgTable(
  "set_logs",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => planItemsTable.id),
    // The exercise actually done, kept even if the item is swapped later.
    exerciseId: text("exercise_id").notNull(),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps"),
    seconds: integer("seconds"),
    loadKg: real("load_kg"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("set_logs_item_set_unique").on(table.itemId, table.setNumber),
    check("set_logs_values", sql`(${table.reps} is null or ${table.reps} between 0 and 200) and (${table.loadKg} is null or ${table.loadKg} between 0 and 1000)`),
  ],
);

/**
 * Every "this hurts" report and every chat safety stop, kept so the coach (and a physio) can see a
 * member's history, and so a safety pause is only lifted with the member's own acknowledgement
 * (build plan 1.2). `stopped` = it paused the plan; `resolvedAt`/`resolvedNote` = the member's resume.
 */
export const painEventsTable = pgTable(
  "pain_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    planId: integer("plan_id").references(() => plansTable.id),
    itemId: integer("item_id"),
    exerciseId: text("exercise_id"),
    area: text("area"),
    note: text("note").notNull(),
    source: text("source").notNull(),
    flag: text("flag"),
    stopped: boolean("stopped").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    resolvedNote: text("resolved_note"),
  },
  (table) => [check("pain_events_source", sql`${table.source} in ('hurts', 'chat', 'resume')`)],
);
