import { gte, sum } from "drizzle-orm";
import { aiUsageTable, db } from "@workspace/db";
import { logger } from "./logger";
import { alert } from "./alerts";

/**
 * The AI layer (Claude API). OFF unless BOTH are set in Replit Secrets:
 *   ANTHROPIC_API_KEY       the API key
 *   AI_MONTHLY_BUDGET_USD   a hard monthly cap in US$, e.g. "50"
 * Every call is logged in ai_usage with its cost. Once this calendar month's (UTC) spend would pass the cap,
 * calls stop and the app carries on without AI (rules-built plans, fixed coach lines). Nothing else changes.
 *
 * Prices: US$ per million tokens for prompts under 100k tokens (docs/COACH-AGENT-SPEC.md §2). Cache writes cost
 * 1.25× input, cache reads 0.1× input. Check Anthropic's own pricing page before launch.
 */
export const MODELS = {
  plan: { id: "claude-sonnet-5-5", inUsd: 2, outUsd: 10 },
  quick: { id: "claude-haiku-5-5", inUsd: 0.1, outUsd: 0.5 },
} as const;
export type Tier = keyof typeof MODELS;
/** The allowance kinds (spec §5); also the ai_usage purpose. */
export type Kind = "chat" | "daily_note" | "plan_notes" | "weekly_review" | "checkin";
export type Purpose = Kind;
export type Message = { role: "user" | "assistant"; content: string };

export type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
export type ApiMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

// ANTHROPIC_BASE_URL is only set by the local checks (a fake API); production always uses Anthropic.
const apiUrl = () => `${(process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`;
const TIMEOUT_MS = 30_000;
const RETRY_WAIT_MS = 1_500;
const RETRY_WAIT_MAX_MS = 5_000;

const apiKey = () => (process.env["ANTHROPIC_API_KEY"] ?? "").trim();

export function aiBudgetUsd(): number {
  const v = Number(process.env["AI_MONTHLY_BUDGET_USD"] ?? "");
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function aiOn(): boolean {
  return apiKey() !== "" && aiBudgetUsd() > 0;
}

/** Cost in millionths of a US$: tokens × (US$ per million tokens). Cache writes 1.25×, reads 0.1× input. */
export const costMicroUsd = (tier: Tier, inputTokens: number, outputTokens: number, cacheWrite = 0, cacheRead = 0) =>
  Math.round((inputTokens + cacheWrite * 1.25 + cacheRead * 0.1) * MODELS[tier].inUsd + outputTokens * MODELS[tier].outUsd);

export async function spentThisMonthMicroUsd(now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db.select({ total: sum(aiUsageTable.costMicroUsd) }).from(aiUsageTable).where(gte(aiUsageTable.at, monthStart));
  return Number(row?.total ?? 0);
}

/** Pure: would this call fit in the budget, assuming the worst case (every output token used)? */
export function fitsBudget(spentMicro: number, budgetUsd: number, tier: Tier, promptChars: number, maxTokens: number): boolean {
  const worstInputTokens = Math.ceil(promptChars / 2); // generous: real text is about 4 characters a token
  return spentMicro + costMicroUsd(tier, worstInputTokens, maxTokens) <= budgetUsd * 1_000_000;
}

/** Once per agent turn (spec §7): does the global monthly budget have room for this turn's worst case? Alerts when not. */
export async function globalBudgetAllows(estMicro: number): Promise<boolean> {
  const spent = await spentThisMonthMicroUsd();
  if (spent + estMicro <= aiBudgetUsd() * 1_000_000) return true;
  logger.warn({ spentUsd: spent / 1e6, budgetUsd: aiBudgetUsd() }, "AI monthly budget reached: carrying on without AI");
  void alert("warning", "AI monthly budget reached", `Spent US$${(spent / 1e6).toFixed(2)} of US$${aiBudgetUsd()}. The app carries on without AI until next month or a higher AI_MONTHLY_BUDGET_USD.`);
  return false;
}

/** Pure: how long to wait before the one retry (spec §13). null = don't retry. */
export function retryWaitMs(status: number, retryAfter: string | null): number | null {
  if (!(status === 429 || status === 529 || status >= 500)) return null;
  const s = Number(retryAfter);
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, RETRY_WAIT_MAX_MS) : RETRY_WAIT_MS;
}

export type ModelReply = { ok: true; content: ContentBlock[]; stopReason: string; costMicro: number } | { ok: false; reason: string };

/**
 * One model call, with one retry on 429/529/5xx (spec §13). Logs every attempt in ai_usage with its cost.
 * No budget check here: an agent turn checks once for the whole turn (spec §7). Never throws.
 */
export async function callModel(args: {
  tier: Tier;
  kind: Kind;
  system: string | TextBlock[];
  messages: ApiMessage[];
  tools?: ToolDef[];
  maxTokens: number;
  userId: number | null;
  promptVersion?: string;
}): Promise<ModelReply> {
  if (!aiOn()) return { ok: false, reason: "ai off" };
  const model = MODELS[args.tier];
  let costMicro = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(apiUrl(), {
        method: "POST",
        headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: model.id, max_tokens: args.maxTokens, system: args.system, messages: args.messages,
          ...(args.tools?.length ? { tools: args.tools } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => null)) as
        | { content?: ContentBlock[]; stop_reason?: string; error?: { type?: string };
            usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } }
        | null;
      const u = body?.usage ?? {};
      const cost = costMicroUsd(args.tier, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_creation_input_tokens ?? 0, u.cache_read_input_tokens ?? 0);
      costMicro += cost;
      // Its own try: a failed log line must never make us call (and pay for) the model again.
      await db.insert(aiUsageTable).values({
        userId: args.userId, purpose: args.kind, kind: args.kind, model: model.id, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0,
        costMicroUsd: cost, ok: res.ok, promptVersion: args.promptVersion ?? null,
      }).catch((err: unknown) => logger.error({ err: err instanceof Error ? err.message : String(err) }, "AI usage not logged"));
      if (res.ok) return { ok: true, content: body?.content ?? [], stopReason: body?.stop_reason ?? "end_turn", costMicro };
      const wait = retryWaitMs(res.status, res.headers.get("retry-after"));
      logger.error({ status: res.status, type: body?.error?.type, kind: args.kind, attempt }, "AI call failed");
      if (wait === null || attempt === 2) {
        void alert("warning", `AI call failed (${args.kind})`, `HTTP ${res.status} ${body?.error?.type ?? ""}`.trim());
        return { ok: false, reason: `http ${res.status}` };
      }
      await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), kind: args.kind, attempt }, "AI call failed");
      if (attempt === 2) {
        void alert("warning", `AI call failed (${args.kind})`, err instanceof Error ? err.message : String(err));
        return { ok: false, reason: "network" };
      }
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    }
  }
  return { ok: false, reason: "unreachable" };
}

/**
 * One plain Claude call (no tools) with its own budget check. Returns the reply text, or null when AI is off, over
 * budget, or the call failed. Never throws: the caller always has a no-AI path.
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
  const promptChars = args.system.length + args.messages.reduce((n, m) => n + m.content.length, 0);
  try {
    const spent = await spentThisMonthMicroUsd();
    if (!fitsBudget(spent, aiBudgetUsd(), args.tier, promptChars, args.maxTokens)) {
      logger.warn({ spentUsd: spent / 1e6, budgetUsd: aiBudgetUsd() }, "AI monthly budget reached: carrying on without AI");
      void alert("warning", "AI monthly budget reached", `Spent US$${(spent / 1e6).toFixed(2)} of US$${aiBudgetUsd()}. Plans and the app carry on without AI until next month or a higher AI_MONTHLY_BUDGET_USD.`);
      return null;
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "AI budget check failed");
    return null;
  }
  const reply = await callModel({ tier: args.tier, kind: args.purpose, system: args.system, messages: args.messages, maxTokens: args.maxTokens, userId: args.userId });
  if (!reply.ok) return null;
  const text = reply.content.filter((c): c is TextBlock => c.type === "text").map((c) => c.text).join("").trim();
  return text || null;
}
