import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { programsTable } from "./programs";

export const lessonsTable = pgTable(
  "lessons",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programsTable.id),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    sets: integer("sets"),
    reps: integer("reps"),
    durationSeconds: integer("duration_seconds"),
    mediaSource: text("media_source"),
    mediaRef: text("media_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("lessons_program_position_unique").on(table.programId, table.position),
    check(
      "lessons_title_length",
      sql`char_length(${table.title}) between 1 and 120`,
    ),
    check(
      "lessons_body_length",
      sql`${table.body} is null or char_length(${table.body}) <= 5000`,
    ),
    check("lessons_sets_non_negative", sql`${table.sets} is null or ${table.sets} >= 0`),
    check("lessons_reps_non_negative", sql`${table.reps} is null or ${table.reps} >= 0`),
    check(
      "lessons_duration_seconds_non_negative",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`,
    ),
    check(
      "lessons_media_source_check",
      sql`${table.mediaSource} is null or ${table.mediaSource} in ('youtube')`,
    ),
  ],
);
