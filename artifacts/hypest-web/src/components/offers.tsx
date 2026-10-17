import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { getGetTrainingQueryKey, useDevUnlock, type Access } from "@workspace/api-client-react";
import { useAppConfig } from "@/lib/config";
import { money, request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

type Kind = "intro_plan" | "plan" | "tier1" | "tier2";

/** The three ways in. Until Stripe exists, dev builds unlock with no charge and live builds say "coming soon". */
export function Offers({ access, onUnlocked }: { access: Access; onUnlocked?: () => void }) {
  const config = useAppConfig();
  const queryClient = useQueryClient();
  const unlock = useDevUnlock({ request });
  const [error, setError] = useState<string | null>(null);
  if (!config) return null;
  const p = config.prices;
  const oneOff: Kind = access.intro_available ? "intro_plan" : "plan";

  const options: { kind: Kind; name: string; price: string; was?: string; per?: string; perks: string[]; best?: boolean }[] = [
    {
      kind: oneOff,
      name: access.intro_available ? "First plan" : "One plan",
      price: money(access.intro_available ? p.intro_plan_cents : p.plan_cents),
      was: access.intro_available ? money(p.plan_cents) : undefined,
      perks: ["Your 4-week plan"],
    },
    { kind: "tier1", name: "Plans", price: money(p.tier1_cents), per: "/mo", perks: ["New plan every 4 weeks"] },
    { kind: "tier2", name: "Coaching", price: money(p.tier2_cents), per: "/mo", perks: ["New plan every 4 weeks", "Log every set", "Plans adapt to you", "This-hurts swaps"], best: true },
  ];

  async function pick(kind: Kind) {
    setError(null);
    if (!config?.dev_tools) return;
    try {
      await unlock.mutateAsync({ data: { kind } });
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      onUnlocked?.();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <div className="offers">
      {options.map((o) => (
        <button key={o.kind} type="button" className={o.best ? "offer offer-best" : "offer"} onClick={() => pick(o.kind)} disabled={!config.dev_tools || unlock.isPending}>
          {o.best ? <span className="offer-tag">Best value</span> : null}
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
        {config.dev_tools ? "Test mode · no charge" : "Payments coming soon"} · US$
      </p>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
