import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTrainingQueryKey } from "@workspace/api-client-react";

const POLLS = 15; // every 2 s for 30 s: Stripe's webhook normally lands within a few seconds

/** Shown after Stripe sends the member back (?checkout=done|cancelled). Access comes only from the webhook, so poll for it. */
export function CheckoutReturn() {
  const [params, setParams] = useSearchParams();
  const status = params.get("checkout");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== "done") return;
    let n = 0;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      if (++n >= POLLS) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [status, queryClient]);

  if (status !== "done" && status !== "cancelled") return null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("checkout");
    setParams(next, { replace: true });
  };
  return (
    <div className="card checkout-return" role="status">
      <span>{status === "done" ? "Payment done. Your access unlocks in a few seconds." : "Checkout cancelled. You weren't charged."}</span>
      <button type="button" className="text-link" onClick={close}>OK</button>
    </div>
  );
}
