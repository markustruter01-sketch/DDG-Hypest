import { Link } from "react-router-dom";
import { getGetJourneyQueryKey, getGetProgressQueryKey, useGetJourney, useGetProgress, type Journey } from "@workspace/api-client-react";
import { request, useTraining } from "@/lib/coaching";
import { shownLoad, useUnits } from "@/lib/units";

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
