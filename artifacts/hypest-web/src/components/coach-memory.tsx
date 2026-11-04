import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCoachMemoryQueryKey, useDeleteCoachMemory, useGetCoachMemory, useUpdateCoachMemory, type MemoryItem } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

const KIND: Record<MemoryItem["kind"], string> = { preference: "Preference", schedule: "Schedule", equipment: "Equipment", goal_detail: "Goal", motivation: "Motivation" };

/** "What your coach remembers" (spec §4): every item, editable and deletable. Delete removes it at once. */
export function CoachMemoryList() {
  const queryClient = useQueryClient();
  const memory = useGetCoachMemory({ query: { queryKey: getGetCoachMemoryQueryKey() }, request });
  const update = useUpdateCoachMemory({ request });
  const remove = useDeleteCoachMemory({ request });
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const items = memory.data?.items ?? [];
  if (!memory.data) return null;

  async function save(id: number) {
    setError(null);
    try {
      queryClient.setQueryData(getGetCoachMemoryQueryKey(), await update.mutateAsync({ memoryId: id, data: { text: text.trim() } }));
      setEditing(null);
    } catch (err) {
      setError(serverErrorText(err));
    }
  }
  async function forget(id: number) {
    setError(null);
    try {
      await remove.mutateAsync({ memoryId: id });
      await queryClient.invalidateQueries({ queryKey: getGetCoachMemoryQueryKey() });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <section className="card memory-list" aria-label="What your coach remembers">
      <h2 className="section-title">What your coach remembers</h2>
      {items.length === 0 ? <p className="label">Nothing yet. Tell your coach your schedule, kit or what keeps you going, and it will show here.</p> : null}
      <ul>
        {items.map((m) => (
          <li key={m.id}>
            <span className="label">{KIND[m.kind]}</span>
            {editing === m.id ? (
              <span className="memory-edit">
                <input className="text-input" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit what your coach remembers" />
                <button type="button" className="secondary-button" onClick={() => save(m.id)} disabled={!text.trim() || update.isPending}>Save</button>
                <button type="button" className="text-link" onClick={() => setEditing(null)}>Cancel</button>
              </span>
            ) : (
              <span className="memory-item">
                <span>{m.text}</span>
                <button type="button" className="text-link" onClick={() => { setEditing(m.id); setText(m.text); }}>Edit</button>
                <button type="button" className="text-link" onClick={() => forget(m.id)} disabled={remove.isPending}>Forget</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
