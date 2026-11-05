import type { AccessLevel } from "@workspace/api-client-react";

/** Tier names and checks in one place (docs/TIERS-AND-BODY-SPEC.md §1). Database kinds: tier1 Starter, tier2 Coaching, tier3 Pro. */
export const TIER_NAME: Record<string, string> = { none: "Free", plan: "One-off plan", tier1: "Starter", tier2: "Coaching", tier3: "Pro" };
/** Pays monthly: a new block every 4 weeks. */
export const isMember = (level: AccessLevel | string | undefined) => level === "tier1" || level === "tier2" || level === "tier3";
/** Coaching and Pro: plans that adapt, swaps, the lighter day, food. */
export const canAdapt = (level: AccessLevel | string | undefined) => level === "tier2" || level === "tier3";
/** Starter and above can chat with the coach. */
export const hasChat = isMember;
