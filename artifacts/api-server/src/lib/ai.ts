import { gte, sum } from "drizzle-orm";
import { aiUsageTable, db } from "@workspace/db";
import { logger } from "./logger";
import { alert } from "./alerts";

/**
 * The AI layer (Claude API). OFF unless BOTH are set in Replit Secrets:
 *   ANTHROPIC_API_KEY       the API key
 *   AI_MONTHLY_BUDGET_USD   a hard monthly cap in US$, e.g. "20"
 * Every call is logged in ai_usage with its cost. Once this calendar month's (UTC) spend would pass the cap,
 * calls stop and the app carries on without AI (rules-built plans, no chat replies). Nothing else changes.
 *
 * Prices: US$ per million tokens for prompts under 100k tokens. Source: Anthropic's pricing as reported by
 * eesel.ai (Haiku 5.5) and apidog.com (Sonnet 5.5), read 23 Oct 2026. Check Anthropic's own pricing page before launch.
 */
export const MODELS = {
  plan: { id: "claude-sonnet-5-5", inUsd: 2, outUsd: 10 },
  quick: { id: "claude-haiku-5-5", inUsd: 0.1, outUsd: 0.5 },
} as const;
export type Tier = keyof typeof MODELS;
export type Purpose = "plan_notes" | "chat";
export type Message = { role: "user" | "assistant"; content: string };

// ANTHROPIC_BASE_URL is only set by the local checks (a fake API); production always uses Anthropic.
const apiUrl = () => `${(process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`;
const TIMEOUT_MS = 30_000;

const apiKey = () => (process.env["ANTHROPIC_API_KEY"] ?? "").trim();

export function aiBudgetUsd(): number {
  const v = Number(process.env["AI_MONTHLY_BUDGET_USD"] ?? "");
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function aiOn(): boolean {
  return apiKey() !== "" && aiBudgetUsd() > 0;
}

/** Cost in millionths of a US$: tokens × (US$ per million tokens). */
export const costMicroUsd = (tier: Tier, inputTokens: number, outputTokens: number) =>
  Math.round(inputTokens * MODELS[tier].inUsd + outputTokens * MODELS[tier].outUsd);

async function spentThisMonthMicroUsd(now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db.select({ total: sum(aiUsageTable.costMicroUsd) }).from(aiUsageTable).where(gte(aiUsageTable.at, monthStart));
  return Number(row?.total ?? 0);
}

/** Pure: would this call fit in the budget, assuming the worst case (every output token used)? */
export function fitsBudget(spentMicro: number, budgetUsd: number, tier: Tier, promptChars: number, maxTokens: number): boolean {
  const worstInputTokens = Math.ceil(promptChars / 2); // generous: real text is about 4 characters a token
  return spentMicro + costMicroUsd(tier, worstInputTokens, maxTokens) <= budgetUsd * 1_000_000;
}

/**
 * One Claude call. Returns the reply text, or null when AI is off, over budget, or the call failed.
 * Never throws: the caller always has a no-AI path.
 */
export async function askClaude(args: {
  tier: Tier;
  purpose: Purpose;
  system: string;
  messages: Message[];
  maxTokens: number;
  userId: number | null;
}): Promise<string | null> {
  if (!aiOn()) return null;
  const model = MODELS[args.tier];
  const promptChars = args.system.length + args.messages.reduce((n, m) => n + m.content.length, 0);
  try {
    const spent = await spentThisMonthMicroUsd();
    if (!fitsBudget(spent, aiBudgetUsd(), args.tier, promptChars, args.maxTokens)) {
      logger.warn({ spentUsd: spent / 1e6, budgetUsd: aiBudgetUsd() }, "AI monthly budget reached: carrying on without AI");
      void alert("warning", "AI monthly budget reached", `Spent US$${(spent / 1e6).toFixed(2)} of US$${aiBudgetUsd()}. Plans and the app carry on without AI until next month or a higher AI_MONTHLY_BUDGET_USD.`);
      return null;
    }
    const res = await fetch(apiUrl(), {
      method: "POST",
      headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: model.id, max_tokens: args.maxTokens, system: args.system, messages: args.messages }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as
      | { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { type?: string } }
      | null;
    const inputTokens = body?.usage?.input_tokens ?? 0;
    const outputTokens = body?.usage?.output_tokens ?? 0;
    await db.insert(aiUsageTable).values({
      userId: args.userId, purpose: args.purpose, model: model.id, inputTokens, outputTokens,
      costMicroUsd: costMicroUsd(args.tier, inputTokens, outputTokens), ok: res.ok,
    });
    if (!res.ok) {
      logger.error({ status: res.status, type: body?.error?.type, purpose: args.purpose }, "AI call failed");
      void alert("warning", `AI call failed (${args.purpose})`, `HTTP ${res.status} ${body?.error?.type ?? ""}`.trim());
      return null;
    }
    const text = (body?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    return text || null;
  } catch (err) {
    logger.error({ err, purpose: args.purpose }, "AI call failed");
    void alert("warning", `AI call failed (${args.purpose})`, err instanceof Error ? err.message : String(err));
    return null;
  }
}
