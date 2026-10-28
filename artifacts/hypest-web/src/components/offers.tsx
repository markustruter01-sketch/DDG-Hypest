import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { getGetTrainingQueryKey, useCreateCheckout, useDevUnlock, type Access } from "@workspace/api-client-react";
import { useAppConfig } from "@/lib/config";
import { money, request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

type Kind = "intro_plan" | "plan" | "tier1" | "tier2";

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
  const oneOff: Kind = access.intro_available ? "intro_plan" : "plan";

  type Option = { kind: Kind; name: string; price: string; was?: string; per?: string; perks: string[]; best?: boolean };
  const coaching: Option = { kind: "tier2", name: "Coaching", price: money(p.tier2_cents), per: "/mo", perks: ["New plan every 4 weeks", "Log every set", "Plans adapt to you", "Swap any move that hurts"], best: true };
  // Plans members can only upgrade; the server cancels Plans once Coaching is paid (billing/sync.ts).
  const upgrade = access.level === "tier1";
  const options: Option[] = upgrade ? [{ ...coaching, name: "Upgrade to Coaching", best: false }] : [
    {
      kind: oneOff,
      name: access.intro_available ? "First plan" : "One plan",
      price: money(access.intro_available ? p.intro_plan_cents : p.plan_cents),
      was: access.intro_available ? money(p.plan_cents) : undefined,
      perks: ["Your 4-week plan"],
    },
    { kind: "tier1", name: "Plans", price: money(p.tier1_cents), per: "/mo", perks: ["New plan every 4 weeks"] },
    coaching,
  ];

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
            {o.was ? <s>{o.was}</s> : null}
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
      {upgrade ? <p className="label" style={{ textAlign: "center" }}>Your Plans membership is cancelled when Coaching starts.</p> : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
