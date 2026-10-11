import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    adultConfirmedAt: timestamp("adult_confirmed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check(
      "users_display_name_length",
      sql`char_length(${table.displayName}) between 1 and 60`,
    ),
    check(
      "users_bio_length",
      sql`${table.bio} is null or char_length(${table.bio}) <= 500`,
    ),
  ],
);
