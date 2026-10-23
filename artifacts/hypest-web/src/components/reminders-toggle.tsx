import { useQueryClient } from "@tanstack/react-query";
import { getGetRemindersQueryKey, useGetReminders, useSetReminders } from "@workspace/api-client-react";
import { request, useTraining } from "@/lib/coaching";

/** Opt-in reminder email when a member misses 3 days. Hidden until Hypest can send email. */
export function RemindersToggle() {
  const training = useTraining();
  const state = useGetReminders({ request, query: { queryKey: getGetRemindersQueryKey(), enabled: Boolean(training.data) } });
  const queryClient = useQueryClient();
  const save = useSetReminders({ request });
  if (!state.data?.available) return null;
  const on = state.data.on;

  async function pick(next: boolean) {
    if (next === on) return;
    queryClient.setQueryData(getGetRemindersQueryKey(), await save.mutateAsync({ data: { on: next } }));
  }

  return (
    <div className="units-toggle" role="group" aria-label="Reminder emails">
      <span className="label">Email me if I miss 3 days</span>
      {([[false, "Off"], [true, "On"]] as const).map(([v, text]) => (
        <button key={text} type="button" className={v === on ? "chip chip-on" : "chip"} aria-pressed={v === on} onClick={() => pick(v)} disabled={save.isPending}>
          {text}
        </button>
      ))}
    </div>
  );
}
