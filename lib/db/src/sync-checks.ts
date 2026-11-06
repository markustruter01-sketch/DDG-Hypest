import { createHash } from "node:crypto";
import { is } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import * as schema from "./schema";

/**
 * `drizzle-kit push` adds new tables and columns but silently leaves an existing CHECK
 * constraint unchanged when its rule changes (seen 6 Nov 2026: tier3, new AI purposes and
 * "food" pain events were all refused by stale rules). Replit's publish copies the same gap
 * to production.
 *
 * This makes every CHECK in the database match the schema files — the one source of truth.
 * Each constraint carries a fingerprint of its rule in its comment, so after the first run
 * only changed rules are touched. A rule that existing rows break is left as it was and
 * reported, never forced.
 */
export type CheckSyncResult = { updated: string[]; failed: { name: string; error: string }[] };

const dialect = new PgDialect();
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const tag = (rule: string) => `schema:${createHash("sha256").update(rule).digest("hex").slice(0, 16)}`;

export function schemaChecks() {
  return (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.checks.map((check) => ({
        table: config.name,
        name: check.name,
        rule: dialect.sqlToQuery(check.value, "indexes").sql,
      }));
    });
}

export async function syncCheckConstraints(pool: pg.Pool): Promise<CheckSyncResult> {
  const { rows } = await pool.query<{ name: string; comment: string | null }>(
    `select c.conname as name, obj_description(c.oid, 'pg_constraint') as comment
       from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'c' and n.nspname = current_schema()`,
  );
  const current = new Map(rows.map((r) => [r.name, r.comment]));
  const result: CheckSyncResult = { updated: [], failed: [] };

  for (const check of schemaChecks()) {
    const fingerprint = tag(check.rule);
    if (current.get(check.name) === fingerprint) continue;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`alter table ${quote(check.table)} drop constraint if exists ${quote(check.name)}`);
      await client.query(`alter table ${quote(check.table)} add constraint ${quote(check.name)} check (${check.rule})`);
      await client.query(`comment on constraint ${quote(check.name)} on ${quote(check.table)} is '${fingerprint}'`);
      await client.query("commit");
      result.updated.push(check.name);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      result.failed.push({ name: check.name, error: err instanceof Error ? err.message : String(err) });
    } finally {
      client.release();
    }
  }
  return result;
}
