import { Link } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBodyQueryKey, getGetJourneyQueryKey, getGetProgressQueryKey, saveBodyMetrics, saveMorningCheckin, useGetBody, useGetJourney, useGetProgress,
  type BodyState, type Journey,
} from "@workspace/api-client-react";
import { serverErrorText } from "@/lib/server-error";
import { request, useTraining } from "@/lib/coaching";
import { shownLoad, toKg, useUnits } from "@/lib/units";

/** Progress on every tier (spec 3.1 §4.1): streak, best lifts, weekly volume, Journey, body metrics, check-ins. */
export function ProgressPage() {
  const training = useTraining();
  const progress = useGetProgress({ query: { queryKey: getGetProgressQueryKey(), enabled: training.isSuccess, retry: false }, request });
  const p = progress.data;
  const units = useUnits();

  if (!p) return <main className="screen-scroll" aria-busy="true"><h1 className="screen-title">Progress</h1></main>;

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Progress</h1>
      <nav className="sub-links" aria-label="More progress">
        <Link className="chip" to="/food">Food</Link>
      </nav>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="card stat"><span className="big-number">{p.streak_days}</span><span className="label">Day streak</span></div>
        <div className="card stat"><span className="big-number">{p.sessions_done}</span><span className="label">Sessions</span></div>
      </div>
      {p.weekly_volume.length > 0 ? (
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <span className="label">Weekly volume ({units} lifted)</span>
          <VolumeChart data={p.weekly_volume} />
        </div>
      ) : null}
      <h2 className="section-title" style={{ margin: 0 }}>Best lifts</h2>
      {p.best_lifts.length === 0 ? <p className="screen-copy">Log a weighted set and it shows here.</p> : null}
      <ul className="program-list">
        {p.best_lifts.map((b) => (
          <li key={b.exercise_id} className="card best-lift">
            <span>{b.name}</span><b className="big-number" style={{ fontSize: "1.5rem" }}>{shownLoad(b.load_kg, units)} {units} × {b.reps}</b>
          </li>
        ))}
      </ul>
      <CheckinCard />
      <BodyCard />
      <JourneyCard />
      <Link className="text-link" to="/plan">See plan</Link>
    </main>
  );
}

const when = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Spec 3.1 §8: the whole journey, from every block. */
function JourneyCard() {
  const q = useGetJourney({ query: { queryKey: getGetJourneyQueryKey(), retry: false }, request });
  const units = useUnits();
  const j: Journey | undefined = q.data;
  if (!j || j.sessions_done === 0) return null;
  return (
    <section className="card journey">
      <h2 className="section-title">Your journey</h2>
      <p className="screen-copy">
        Since {when(j.first_session_on!)}: {j.sessions_done} sessions, {j.blocks_finished} {j.blocks_finished === 1 ? "block" : "blocks"} finished,
        best run {j.longest_week_streak} {j.longest_week_streak === 1 ? "week" : "weeks"} in a row.
      </p>
      {j.session_milestones.length ? (
        <ul className="journey-milestones">
          {j.session_milestones.map((m) => <li key={m.count}><b>{m.count}</b> <span className="label">sessions · {when(m.reached_on)}</span></li>)}
        </ul>
      ) : null}
      {j.next_milestone ? <span className="label">Next: {j.next_milestone} sessions ({j.next_milestone - j.sessions_done} to go)</span> : null}
      {j.lifts.length ? (
        <table className="journey-lifts">
          <thead><tr><th>Lift</th><th>Then</th><th>Best</th><th>Now</th></tr></thead>
          <tbody>
            {j.lifts.map((l) => (
              <tr key={l.exercise_id}>
                <td>{l.name}</td>
                <td>{shownLoad(l.first_kg, units)}</td>
                <td title={when(l.best_on)}>{shownLoad(l.best_kg, units)} × {l.best_reps}</td>
                <td>{shownLoad(l.now_kg, units)} {units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function VolumeChart({ data }: { data: { week_start: string; volume_kg: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.volume_kg));
  const w = 320, h = 120, gap = 8, bw = (w - gap * (data.length - 1)) / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, display: "block", marginTop: "var(--space-2)" }} role="img" aria-label="Weekly volume">
      {data.map((d, i) => {
        const bh = Math.max(2, (d.volume_kg / max) * (h - 4));
        const lastBar = i === data.length - 1;
        return <rect key={d.week_start} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} fill={lastBar ? "var(--color-volt)" : "var(--color-ink)"} stroke={lastBar ? "var(--color-ink)" : "none"} strokeWidth={lastBar ? 2 : 0} />;
      })}
    </svg>
  );
}

function useBody() {
  const q = useGetBody({ query: { queryKey: getGetBodyQueryKey(), retry: false }, request });
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<BodyState>) => {
    setError(null);
    try {
      qc.setQueryData(getGetBodyQueryKey(), await action());
    } catch (err) {
      setError(serverErrorText(err));
    }
  };
  return { b: q.data, run, error };
}

const SCALE = [1, 2, 3, 4, 5];

/** Spec 3.1 §7: three taps each morning. The rule (code, not the coach) decides a lighter day. */
function CheckinCard() {
  const { b, run, error } = useBody();
  const [sleep, setSleep] = useState(14);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(2);
  if (!b) return null;
  const c = b.checkin_today;
  return (
    <section className="card checkin">
      <h2 className="section-title">Morning check-in</h2>
      {c ? (
        <p className="screen-copy">Today: {c.sleep_half_hours / 2} h sleep · energy {c.energy}/5 · soreness {c.soreness}/5</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void run(() => saveMorningCheckin({ sleep_half_hours: sleep, energy, soreness }, request)); }}>
          <label className="label">Sleep: {sleep / 2} h
            <input type="range" min={0} max={28} step={1} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} />
          </label>
          <Scale label="Energy" value={energy} onChange={setEnergy} />
          <Scale label="Soreness" value={soreness} onChange={setSoreness} />
          <button className="primary-button" type="submit">Save</button>
        </form>
      )}
      {b.low_day ? <p className="screen-copy">{b.low_day}</p> : null}
      {b.upgrade_note ? <p className="label">{b.upgrade_note}</p> : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <fieldset className="choice-row">
      <legend className="label">{label} (1 low, 5 high)</legend>
      {SCALE.map((n) => <button key={n} type="button" className={value === n ? "chip chip-on" : "chip"} aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>)}
    </fieldset>
  );
}

/** Spec 3.1 §6: weight and waist, one entry a day, a 7-day average line and no goal line. */
function BodyCard() {
  const { b, run, error } = useBody();
  const units = useUnits();
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  if (!b) return null;
  const last = b.metrics.at(-1);
  return (
    <section className="card body-card">
      <h2 className="section-title">Body</h2>
      {last ? <p className="screen-copy">{last.day}: {last.weight_kg !== null ? `${shownLoad(last.weight_kg, units)} ${units}` : ""}{last.weight_kg !== null && last.waist_cm !== null ? " · " : ""}{last.waist_cm !== null ? `waist ${last.waist_cm} cm` : ""}</p> : null}
      {b.average_7d.length > 1 ? <AverageLine data={b.average_7d} /> : null}
      <form className="body-form" onSubmit={(e) => {
        e.preventDefault();
        const w = Number(weight), c = Number(waist);
        void run(() => saveBodyMetrics({ weight_kg: w > 0 ? toKg(w, units) : null, waist_cm: c > 0 ? c : null }, request)).then(() => { setWeight(""); setWaist(""); });
      }}>
        <input className="text-input" inputMode="decimal" placeholder={`Weight (${units})`} value={weight} onChange={(e) => setWeight(e.target.value)} />
        <input className="text-input" inputMode="decimal" placeholder="Waist (cm)" value={waist} onChange={(e) => setWaist(e.target.value)} />
        <button className="secondary-button" type="submit" disabled={!weight && !waist}>Save today</button>
      </form>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {b.monthly_reports.length ? (
        <details>
          <summary>Monthly reports</summary>
          {b.monthly_reports.map((r) => <article key={r.month} className="report"><b>{r.month}</b><p className="screen-copy">{r.text}</p></article>)}
        </details>
      ) : null}
    </section>
  );
}

function AverageLine({ data }: { data: { day: string; weight_kg: number }[] }) {
  const w = 320, h = 100;
  const vals = data.map((d) => d.weight_kg);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(0.5, hi - lo);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - 4 - ((d.weight_kg - lo) / span) * (h - 8)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, display: "block" }} role="img" aria-label="7-day average weight">
      <polyline points={pts} fill="none" stroke="var(--color-ink)" strokeWidth={2} />
    </svg>
  );
}
