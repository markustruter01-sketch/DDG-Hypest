import { useQueryClient } from "@tanstack/react-query";
import { getGetTrainingQueryKey, useSetUnits } from "@workspace/api-client-react";
import { request, useTraining } from "@/lib/coaching";
import { useUnits, type Units } from "@/lib/units";

/** kg or lb for every weight in the app. Shown once the member has answered onboarding. */
export function UnitsToggle() {
  const training = useTraining();
  const units = useUnits();
  const queryClient = useQueryClient();
  const save = useSetUnits({ request });
  if (!training.data?.profile) return null;

  async function pick(u: Units) {
    if (u === units) return;
    queryClient.setQueryData(getGetTrainingQueryKey(), await save.mutateAsync({ data: { units: u } }));
  }

  return (
    <div className="units-toggle" role="group" aria-label="Weight units">
      <span className="label">Weights in</span>
      {(["kg", "lb"] as const).map((u) => (
        <button key={u} type="button" className={u === units ? "chip chip-on" : "chip"} aria-pressed={u === units} onClick={() => pick(u)} disabled={save.isPending}>
          {u}
        </button>
      ))}
    </div>
  );
}
