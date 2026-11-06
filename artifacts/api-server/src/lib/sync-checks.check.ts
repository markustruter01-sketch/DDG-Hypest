// Database CHECK rules follow the schema files even when `drizzle-kit push` leaves an old rule in place
// (lib/db/src/sync-checks.ts). LOCAL DATABASE ONLY: it briefly replaces one rule with an old version.
import assert from "node:assert/strict";
import { pool, schemaChecks, syncCheckConstraints } from "@workspace/db";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };
const ruleOf = async (name: string) =>
  (await pool.query<{ def: string }>("select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1", [name])).rows[0]?.def ?? "";

const checks = schemaChecks();
ok(checks.some((c) => c.name === "memberships_kind" && c.rule.includes("'tier3'")), "the schema's membership rule allows tier3");

// The servers already ran the sync at start: every schema rule is in place, so a second run changes nothing.
const settled = await syncCheckConstraints(pool);
ok(settled.updated.length === 0 && settled.failed.length === 0, `already in line: nothing to change (${JSON.stringify(settled)})`);

// Put back the pre-Phase-3 rule, as `push` left it on 6 Nov 2026.
await pool.query(`alter table memberships drop constraint memberships_kind`);
// NOT VALID: earlier checks may already have saved tier3 rows, which the old rule would refuse.
await pool.query(`alter table memberships add constraint memberships_kind check (kind in ('intro_plan', 'plan', 'tier1', 'tier2')) not valid`);
ok(!(await ruleOf("memberships_kind")).includes("tier3"), "stale rule in place (no tier3)");

const fixed = await syncCheckConstraints(pool);
ok(fixed.updated.length === 1 && fixed.updated[0] === "memberships_kind" && fixed.failed.length === 0, `only the stale rule is replaced (${JSON.stringify(fixed)})`);
ok((await ruleOf("memberships_kind")).includes("tier3"), "rule now allows tier3");

const again = await syncCheckConstraints(pool);
ok(again.updated.length === 0, "running again changes nothing");

// A missing rule is added back.
await pool.query(`alter table pain_events drop constraint pain_events_source`);
const added = await syncCheckConstraints(pool);
ok(added.updated.includes("pain_events_source") && (await ruleOf("pain_events_source")).includes("'food'"), "a missing rule is added");

await pool.end();
console.log(`sync-checks: ${n} checks passed`);
