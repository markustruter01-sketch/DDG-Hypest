import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { saveOnboardingTrial, type PlanSessionView, type TrialSession } from "@workspace/api-client-react";
import { dose, request } from "@/lib/coaching";
import { toKg, useUnits } from "@/lib/units";

/**
 * The free session before signup (docs/TIERS-AND-BODY-SPEC.md §4.2): week 1, day 1 of the preview, no account. Sets are
 * kept in this tab and with the onboarding draft; signup carries them into the member's plan. "This hurts" ends the
 * trial with the same advice as in the app (there is no account, so nothing is stored about it).
 */
export const TRIAL_KEY = "hypest_trial_session";

type Entry = { done: boolean; reps: number; load: number; seconds: number };

function readDay(): PlanSessionView | null {
  try {
    const raw = sessionStorage.getItem(TRIAL_KEY);
    return raw ? (JSON.parse(raw) as PlanSessionView) : null;
  } catch {
    return null;
  }
}

export function TrialPage() {
  const navigate = useNavigate();
  const units = useUnits();
  const [day] = useState(readDay);
  const [sets, setSets] = useState<Record<number, Entry[]>>(() =>
    Object.fromEntries((day?.items ?? []).map((it, i) => [i + 1, Array.from({ length: it.sets }, () => ({ done: false, reps: it.reps ?? 0, load: 0, seconds: it.seconds ?? 0 }))])));
  const [hurt, setHurt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = (finished: boolean): TrialSession => ({
    finished,
    sets: (day?.items ?? []).flatMap((it, i) => (sets[i + 1] ?? []).flatMap((e, n) => (e.done ? [{
      position: i + 1, exercise_id: it.exercise_id, set_number: n + 1,
      reps: it.measure === "reps" ? e.reps : null, seconds: it.measure === "time" ? e.seconds : null,
      load_kg: it.weighted && e.load > 0 ? toKg(e.load, units) : null,
    }] : []))),
  });

  // Keep progress with the draft as the visitor goes (best effort: the tab keeps it too).
  useEffect(() => {
    if (!day) return;
    const done = Object.values(sets).some((list) => list.some((e) => e.done));
    if (done) void saveOnboardingTrial(body(false), request).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets]);

  if (!day) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Try a session</h1>
        <p className="screen-copy">Answer a few questions first, then try day 1 for free.</p>
        <Link className="primary-button" to="/coaches">Meet the coaches</Link>
      </main>
    );
  }

  const update = (pos: number, n: number, patch: Partial<Entry>) =>
    setSets((all) => ({ ...all, [pos]: (all[pos] ?? []).map((e, i) => (i === n ? { ...e, ...patch } : e)) }));

  async function finish() {
    setError(null);
    try {
      await saveOnboardingTrial(body(true), request);
      navigate("/signup?then=plan&from=trial");
    } catch {
      setError("Couldn't save your session. Check your connection and try again.");
    }
  }

  if (hurt) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Stop here</h1>
        <p className="screen-copy">Stop this exercise. If the pain is sharp, or it doesn't settle, get it checked by a doctor or physiotherapist before you train again. If it is severe or sudden, call 000.</p>
        <Link className="secondary-button" to="/">Back to Hypest</Link>
      </main>
    );
  }

  return (
    <main className="screen-scroll trial">
      <span className="label">Free session · no account needed</span>
      <h1 className="screen-title">{day.title}</h1>
      {day.items.map((it, i) => (
        <article key={`${it.exercise_id}-${i}`} className="card trial-item">
          <b>{it.name}</b>
          <span className="label">{dose(it)} · {it.cue}</span>
          {(sets[i + 1] ?? []).map((e, n) => (
            <div key={n} className="trial-set">
              <span className="label">Set {n + 1}</span>
              {it.measure === "reps" ? (
                <input className="text-input" inputMode="numeric" aria-label={`Set ${n + 1} reps`} value={e.reps} onChange={(ev) => update(i + 1, n, { reps: Math.max(0, Math.min(200, Number(ev.target.value) || 0)) })} />
              ) : (
                <input className="text-input" inputMode="numeric" aria-label={`Set ${n + 1} seconds`} value={e.seconds} onChange={(ev) => update(i + 1, n, { seconds: Math.max(0, Math.min(7200, Number(ev.target.value) || 0)) })} />
              )}
              {it.weighted ? <input className="text-input" inputMode="decimal" aria-label={`Set ${n + 1} weight in ${units}`} placeholder={units} value={e.load || ""} onChange={(ev) => update(i + 1, n, { load: Math.max(0, Math.min(1000, Number(ev.target.value) || 0)) })} /> : null}
              <button type="button" className={e.done ? "tick tick-on" : "tick"} aria-pressed={e.done} aria-label={`Set ${n + 1} done`} onClick={() => update(i + 1, n, { done: !e.done })}>
                <Check size={18} strokeWidth={3} />
              </button>
            </div>
          ))}
          <button type="button" className="text-link" onClick={() => setHurt(true)}>This hurts</button>
        </article>
      ))}
      <button type="button" className="primary-button" onClick={finish}>Finish: save it and get the rest of week 1 free</button>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </main>
  );
}
