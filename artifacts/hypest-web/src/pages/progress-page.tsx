import { Link } from "react-router-dom";
import { getGetProgressQueryKey, useGetProgress } from "@workspace/api-client-react";
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
      <Link className="text-link" to="/plan">See plan</Link>
    </main>
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
