// Checks the commission-source rule. Run from repo root: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/lib/referral.check.ts
import assert from "node:assert/strict";
import { commissionSource } from "./referral";

const now = new Date("2026-10-17T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const src = (cookieClick: { creatorId: number; at: Date } | null, accountClick: { creatorId: number; at: Date } | null, programCreatorId = 7) =>
  commissionSource({ programCreatorId, cookieClick, accountClick, now });

assert.equal(src(null, null), "hypest_found", "no link");
assert.equal(src({ creatorId: 7, at: daysAgo(1) }, null), "creator_brought", "own link, 1 day");
assert.equal(src({ creatorId: 7, at: daysAgo(30) }, null), "creator_brought", "own link, exactly 30 days");
assert.equal(src({ creatorId: 7, at: daysAgo(31) }, null), "hypest_found", "own link, 31 days");
assert.equal(src({ creatorId: 8, at: daysAgo(1) }, null), "hypest_found", "other creator's link");
assert.equal(src({ creatorId: 8, at: daysAgo(1) }, { creatorId: 7, at: daysAgo(5) }), "hypest_found", "last link wins (other creator newer)");
assert.equal(src({ creatorId: 8, at: daysAgo(5) }, { creatorId: 7, at: daysAgo(1) }), "creator_brought", "last link wins (account newer)");
assert.equal(src(null, { creatorId: 7, at: daysAgo(2) }), "creator_brought", "different device: account click");
assert.equal(src({ creatorId: 7, at: new Date(now.getTime() + 60_000) }, null), "hypest_found", "future-dated cookie ignored");
console.log("referral rule: all 9 checks passed");
