import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/**
 * Phase 3 (docs/TIERS-AND-BODY-SPEC.md): conversion events, nutrition-lite, body metrics, the morning check-in,
 * per-tier AI caps and the Pro reports. Unique indexes (not constraints) so `db push` adds them without prompts.
 */

/** Spec §4.3. No IP, no email; props only from a fixed list of keys (enforced in code). Kept 400 days. */
export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    userId: integer("user_id").references(() => usersTable.id),
    draftHash: text("draft_hash"),
    props: jsonb("props").notNull().default({}),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [index("events_name_at").on(table.name, table.at), index("events_at").on(table.at)],
);

/** Spec §5.2: the nutrition set-up. Health data: never sent to a model. */
export const nutritionProfilesTable = pgTable(
  "nutrition_profiles",
  {
    userId: integer("user_id").primaryKey().references(() => usersTable.id),
    sex: text("sex").notNull(),
    birthYear: integer("birth_year").notNull(),
    heightCm: real("height_cm").notNull(),
    weightKg: real("weight_kg").notNull(),
    foodsToAvoid: text("foods_to_avoid").array().notNull(),
    pregnant: boolean("pregnant").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("nutrition_profiles_sex", sql`${table.sex} in ('female', 'male', 'unsaid')`),
    check("nutrition_profiles_height", sql`${table.heightCm} between 120 and 230`),
    check("nutrition_profiles_weight", sql`${table.weightKg} between 35 and 300`),
  ],
);

/** Spec §5.3: the latest targets, worked out by coaching/nutrition.ts (formula, no AI). */
export const nutritionTargetsTable = pgTable("nutrition_targets", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id),
  kcal: integer("kcal").notNull(),
  proteinG: integer("protein_g").notNull(),
  floorKcal: integer("floor_kcal").notNull(),
  ceilingKcal: integer("ceiling_kcal").notNull(),
  maintenanceOnly: boolean("maintenance_only").notNull(),
  computedDay: text("computed_day").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Spec §5.4: the week's meal plan and grocery list, checked in code before it is stored. */
export const mealPlansTable = pgTable(
  "meal_plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    weekOf: text("week_of").notNull(),
    plan: jsonb("plan").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("meal_plans_user_week").on(table.userId, table.weekOf)],
);

/** Spec §5.5: one logged meal (estimates). Photos are never stored. */
export const mealLogsTable = pgTable(
  "meal_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    day: text("day").notNull(),
    text: text("text").notNull(),
    items: jsonb("items").notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: integer("protein_g").notNull(),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [index("meal_logs_user_day").on(table.userId, table.day)],
);

/** Spec §6: one row per member per day; a second entry that day replaces the first. */
export const bodyMetricsTable = pgTable(
  "body_metrics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    day: text("day").notNull(),
    weightKg: real("weight_kg"),
    waistCm: real("waist_cm"),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("body_metrics_user_day").on(table.userId, table.day),
    check("body_metrics_weight", sql`${table.weightKg} is null or ${table.weightKg} between 35 and 300`),
    check("body_metrics_waist", sql`${table.waistCm} is null or ${table.waistCm} between 40 and 200`),
  ],
);

/** Spec §7: the morning check-in (Phase 2's `checkins` is the coach's scheduled messages). */
export const morningCheckinsTable = pgTable(
  "morning_checkins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    day: text("day").notNull(),
    sleepHalfHours: integer("sleep_half_hours").notNull(),
    energy: integer("energy").notNull(),
    soreness: integer("soreness").notNull(),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("morning_checkins_user_day").on(table.userId, table.day),
    check("morning_checkins_values", sql`${table.sleepHalfHours} between 0 and 28 and ${table.energy} between 1 and 5 and ${table.soreness} between 1 and 5`),
  ],
);

/** Spec §2: the most a member's AI may cost in a UTC month, per tier. Seeded, then the one source. */
export const memberCapsTable = pgTable("member_caps", {
  tier: text("tier").primaryKey(),
  capMicroUsd: integer("cap_micro_usd").notNull(),
});

/** Spec §7b: Pro's monthly progress report, kept forever. */
export const monthlyReportsTable = pgTable(
  "monthly_reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    month: text("month").notNull(),
    status: text("status").notNull(),
    text: text("text"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("monthly_reports_user_month").on(table.userId, table.month),
    check("monthly_reports_status", sql`${table.status} in ('working', 'done', 'skipped', 'failed')`),
  ],
);

/** Spec §7b: Pro's Wednesday check-in, once per member per local week. */
export const midweekChecksTable = pgTable(
  "midweek_checks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    weekOf: text("week_of").notNull(),
    status: text("status").notNull(),
    messageId: integer("message_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("midweek_checks_user_week").on(table.userId, table.weekOf),
    check("midweek_checks_status", sql`${table.status} in ('working', 'done', 'skipped', 'failed')`),
  ],
);
