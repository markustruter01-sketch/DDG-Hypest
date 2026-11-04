import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addPlanNotes, getGetTrainingQueryKey, type TrainingState } from "@workspace/api-client-react";
import { request, useTraining } from "@/lib/coaching";

/**
 * Spec §12: a new block shows at once, built by the rules; then this asks the server for the coach's notes once,
 * and drops them into the plan when they arrive. Renders nothing.
 */
export function PlanNotesWhenPending() {
  const training = useTraining();
  const queryClient = useQueryClient();
  const asked = useRef<number | null>(null);
  const plan = training.data?.plan ?? null;
  const id = plan?.notes_status === "pending" ? plan.id : null;
  useEffect(() => {
    if (id === null || asked.current === id) return;
    asked.current = id;
    void addPlanNotes(id, request)
      .then((next) => queryClient.setQueryData<TrainingState>(getGetTrainingQueryKey(), (old) => (old && old.plan?.id === next.id ? { ...old, plan: next } : old)))
      .catch(() => undefined); // notes are optional: the plan already works without them
  }, [id, queryClient]);
  return null;
}
