import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { confirmCheckout, createPlan, getGetTrainingQueryKey, getTraining, type Access } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { useAppConfig } from "@/lib/config";

const POLL_MS = 2000;
const POLLS = 15; // backup only: if the instant confirm fails, wait up to 30 s for Stripe's webhook

const unlocked = (a: Access | undefined) => Boolean(a && (a.level !== "none" || a.plan_credits > 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * After Stripe sends the member back (?checkout=done&session_id=… or ?checkout=cancelled).
 * Done: the server confirms the session with Stripe at once, the first plan is built if there is none yet, and the
 * member lands on their plan. The webhook is the backup: if the confirm fails, poll for its result for 30 s.
 */
export function CheckoutReturn() {
  const [params, setParams] = useSearchParams();
  const status = params.get("checkout");
  const sessionId = params.get("session_id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const started = useRef(false);
  const [phase, setPhase] = useState<"idle" | "unlocking" | "welcome" | "slow" | "cancelled">("idle");

  useEffect(() => {
    if (status === "cancelled") {
      setPhase("cancelled");
      return;
    }
    if (status !== "done" || started.current) return;
    started.current = true;
    setPhase("unlocking");
    const clean = () => setParams((p) => { p.delete("checkout"); p.delete("session_id"); return p; }, { replace: true });

    void (async () => {
      let ok = false;
      if (sessionId) {
        try {
          ok = unlocked((await confirmCheckout({ session_id: sessionId }, request)).access);
        } catch {
          ok = false; // network or Stripe hiccup: fall back to the webhook below
        }
      }
      for (let i = 0; !ok && i < POLLS; i++) {
        await wait(POLL_MS);
        try { ok = unlocked((await getTraining(request)).access); } catch { /* keep trying */ }
      }
      if (!ok) {
        clean();
        setPhase("slow");
        return;
      }
      // Paid from onboarding: the answers are saved, so build the plan now instead of making them tap again.
      try {
        const state = await getTraining(request);
        if (state.profile && !state.plan) await createPlan(request);
      } catch {
        /* Today still offers "Build my plan" */
      }
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      navigate("/plan", { replace: true });
      setPhase("welcome");
      setTimeout(() => setPhase((p) => (p === "welcome" ? "idle" : p)), 5000);
    })();
  }, [status, sessionId, navigate, queryClient, setParams]);

  const close = () => {
    setPhase("idle");
    setParams((p) => { p.delete("checkout"); p.delete("session_id"); return p; }, { replace: true });
  };

  if (phase === "unlocking") {
    return (
      <div className="unlock-overlay" role="status" aria-live="polite">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <span className="unlock-title">Unlocking your plan</span>
        <span className="label">Payment received</span>
      </div>
    );
  }
  if (phase === "idle") return null;
  const text =
    phase === "welcome" ? "You're in. Here's your plan."
    : phase === "cancelled" ? "Checkout cancelled. You weren't charged."
    : `Payment received, but unlocking is taking longer than usual. Refresh in a minute, or email ${config?.support_email ?? "support"} and we'll sort it.`;
  return (
    <div className="card checkout-return" role="status">
      <span>{text}</span>
      <button type="button" className="text-link" onClick={close}>OK</button>
    </div>
  );
}
