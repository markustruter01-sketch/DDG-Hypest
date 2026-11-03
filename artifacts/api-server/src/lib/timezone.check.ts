// Time zone checks (build plan 1.3). Pure: no database, no API.
// Run from repo root: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/lib/timezone.check.ts
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FALLBACK_TIMEZONE, isTimezone, localDay, localDayStart, localWeekStart, zoneOf } from "./timezone";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

ok(isTimezone("America/New_York") && isTimezone("Australia/Brisbane") && isTimezone("UTC"), "real zones accepted");
ok(!isTimezone("Mars/Base") && !isTimezone("") && !isTimezone(10) && !isTimezone("x".repeat(65)), "anything else refused");
ok(zoneOf(null) === FALLBACK_TIMEZONE && zoneOf("Nowhere/Here") === FALLBACK_TIMEZONE, "unknown falls back to UTC");

// 2026-11-04 03:00 UTC is 13:00 on the 4th in Brisbane and 22:00 on the 3rd in New York.
const t = new Date("2026-11-04T03:00:00Z");
ok(localDay(t, "Australia/Brisbane") - localDay(t, "America/New_York") === 1, "same instant, different calendar days");
ok(localDayStart(t, "Australia/Brisbane").toISOString() === "2026-11-03T14:00:00.000Z", "Brisbane midnight (UTC+10)");
ok(localDayStart(t, "America/New_York").toISOString() === "2026-11-03T05:00:00.000Z", "New York midnight (UTC-5 after DST ended 1 Nov)");
// Daylight-saving day: New York's 8 Mar 2026 starts at 05:00 UTC (EST), the next day at 04:00 UTC (EDT).
ok(localDayStart(new Date("2026-03-08T20:00:00Z"), "America/New_York").toISOString() === "2026-03-08T05:00:00.000Z", "DST start day: midnight in EST");
ok(localDayStart(new Date("2026-03-09T20:00:00Z"), "America/New_York").toISOString() === "2026-03-09T04:00:00.000Z", "day after: midnight in EDT");
ok(localWeekStart(new Date("2026-11-08T23:30:00Z"), "Australia/Brisbane") === "2026-11-09", "Brisbane Monday morning is the new week");
ok(localWeekStart(new Date("2026-11-08T23:30:00Z"), "America/Los_Angeles") === "2026-11-02", "still Sunday in LA: last week");

// Grep test: no hard-coded Brisbane offset anywhere in the app code.
const findRoot = (start: string): string | null => {
  for (let d = resolve(start); d !== dirname(d); d = dirname(d)) if (existsSync(join(d, "pnpm-workspace.yaml"))) return d;
  return null;
};
const root = findRoot(process.cwd()); // run from the repo root or a package (check-all.sh runs from scripts/)
if (!root) throw new Error("repo root (pnpm-workspace.yaml) not found");
const banned = [/\+\s*10\s*\*\s*36(?:00|_?000)/, /getUTCHours\(\)\s*\+\s*10/, /brisbane(?:Day|DayStart)\s*\(/i, /10\s*\*\s*3_?600_?000/];
const offenders: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "generated", ".git"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !p.endsWith("timezone.check.ts")) {
      const text = readFileSync(p, "utf8");
      if (banned.some((re) => re.test(text))) offenders.push(p.slice(root.length + 1));
    }
  }
};
walk(join(root, "artifacts"));
walk(join(root, "lib"));
ok(offenders.length === 0, `hard-coded Brisbane time in: ${offenders.join(", ")}`);

console.log(`timezone: ${n} checks passed`);
