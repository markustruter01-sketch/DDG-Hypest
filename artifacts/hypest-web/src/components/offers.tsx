import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { getGetTrainingQueryKey, useCreateCheckout, useDevUnlock, type Access } from "@workspace/api-client-react";
import { useAppConfig } from "@/lib/config";
import { money, request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

type Kind = "tier1" | "tier2" | "tier3";
const RANK: Record<string, number> = { tier1: 1, tier2: 2, tier3: 3 };

/** A page on this site (a router path, or the current page), as an absolute URL Stripe can send the member back to. */
export function returnUrl(routerPath?: string): string {
  const path = routerPath === undefined ? window.location.pathname : `${import.meta.env.BASE_URL.replace(/\/$/, "")}${routerPath}`;
  return new URL(path, window.location.origin).toString();
}

/**
 * The three ways in. payments test/live → Stripe Checkout (access arrives by webhook after the member comes back);
 * payments off → dev builds unlock with no charge, other builds say "coming soon".
 * beforePay runs before leaving for Stripe (e.g. save the onboarding answers); returnTo is the page to come back to.
 */
export function Offers({ access, onUnlocked, beforePay, returnTo }: { access: Access; onUnlocked?: () => void; beforePay?: () => Promise<unknown>; returnTo?: string }) {
  const config = useAppConfig();
  const queryClient = useQueryClient();
  const unlock = useDevUnlock({ request });
  const checkout = useCreateCheckout({ request });
  const [error, setError] = useState<string | null>(null);
  // The option being bought: shows its spinner from the tap until Stripe's page opens (or an error comes back).
  const [pending, setPending] = useState<Kind | null>(null);
  if (!config) return null;
  const p = config.prices;

  // docs/TIERS-AND-BODY-SPEC.md §1: only what is built is listed. Coaching carries the "Best value" badge (our judgement).
  type Option = { kind: Kind; name: string; price: string; per?: string; perks: string[]; best?: boolean };
  const all: Option[] = [
    { kind: "tier1", name: "Starter", price: money(p.tier1_cents), per: "/mo", perks: ["A new plan every month, a little harder each week", "3 coach chats a day", "Calorie and protein targets"] },
    { kind: "tier2", name: "Coaching", price: money(p.tier2_cents), per: "/mo", best: true, perks: ["Weights set from what you actually lifted", "A gentler swap when something hurts", "A lighter day after a rough night", "Meal plans, and meal logging by photo", "20 coach chats a day, and the Sunday review"] },
    { kind: "tier3", name: "Pro", price: money(p.tier3_cents), per: "/mo", perks: ["Everything in Coaching", "40 coach chats a day", "A Wednesday check-in and a monthly report", "More meal-plan rebuilds"] },
  ];
  // Members can only move up here; the server cancels the lower membership once the higher one is paid (billing/sync.ts).
  const current = RANK[access.level] ?? 0;
  const upgrade = current > 0;
  const options = all.filter((o) => (RANK[o.kind] ?? 0) > current).map((o) => (upgrade ? { ...o, name: `Upgrade to ${o.name}` } : o));
  if (!options.length) return null;

  const paying = config.payments !== "off";
  const usable = paying || config.dev_tools;
  const busy = pending !== null || unlock.isPending || checkout.isPending;

  async function pick(kind: Kind) {
    setError(null);
    setPending(kind);
    try {
      if (paying) {
        await beforePay?.();
        const { url } = await checkout.mutateAsync({ data: { kind, return_url: returnUrl(returnTo) } });
        window.location.assign(url); // keep the spinner while the browser leaves for Stripe
        return;
      }
      if (!config?.dev_tools) return setPending(null);
      await unlock.mutateAsync({ data: { kind } });
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      setPending(null);
      onUnlocked?.();
    } catch (err) {
      setPending(null);
      setError(serverErrorText(err));
    }
  }

  const note = config.payments === "live" ? "Secure checkout by Stripe" : config.payments === "test" ? "Test mode · no real charge" : config.dev_tools ? "Dev unlock · no charge" : "Payments coming soon";

  return (
    <div className="offers">
      {options.map((o) => (
        <button key={o.kind} type="button" className={`offer${o.best ? " offer-best" : ""}${pending === o.kind ? " offer-pending" : ""}`} onClick={() => pick(o.kind)} disabled={!usable || busy} aria-busy={pending === o.kind}>
          {o.best ? <span className="offer-tag">Best value</span> : null}
          {pending === o.kind ? (
            <span className="offer-wait" role="status">
              <span className="spinner" aria-hidden="true" /> {paying ? "Opening secure checkout…" : "Unlocking…"}
            </span>
          ) : null}
          <span className="offer-name">{o.name}</span>
          <span className="offer-price">
            <b>{o.price}</b>
            {o.per ? <small>{o.per}</small> : null}
          </span>
          <span className="offer-perks">
            {o.perks.map((perk) => (
              <span key={perk}><Check size={14} strokeWidth={3} aria-hidden="true" /> {perk}</span>
            ))}
          </span>
        </button>
      ))}
      <p className="label" style={{ textAlign: "center" }}>
        {note} · US$
      </p>
      {upgrade ? <p className="label" style={{ textAlign: "center" }}>Your current membership is cancelled when the new one starts.</p> : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
