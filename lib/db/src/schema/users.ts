import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    // Public link name: hypest.../@handle. Set once by the creator; null until claimed.
    handle: text("handle"),
    // Last creator link this account arrived through (for the 10% "creator brought" rate).
    referredByCreatorId: integer("referred_by_creator_id").references((): AnyPgColumn => usersTable.id),
    referredAt: timestamp("referred_at"),
    adultConfirmedAt: timestamp("adult_confirmed_at").notNull(),
    // Stripe Customer created by the first checkout; used for the billing portal.
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // A unique index (not a unique constraint) so `db push` adds it without a truncate prompt on tables that have rows.
    uniqueIndex("users_handle_unique").on(table.handle),
    uniqueIndex("users_stripe_customer_unique").on(table.stripeCustomerId),
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check(
      "users_display_name_length",
      sql`char_length(${table.displayName}) between 1 and 60`,
    ),
    check("users_handle_format", sql`${table.handle} is null or ${table.handle} ~ '^[a-z0-9_]{3,30}$'`),
    check(
      "users_referral_pair",
      sql`(${table.referredByCreatorId} is null) = (${table.referredAt} is null)`,
    ),
    check(
      "users_bio_length",
      sql`${table.bio} is null or char_length(${table.bio}) <= 500`,
    ),
  ],
);
