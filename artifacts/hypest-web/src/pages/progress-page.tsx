import { Link } from "react-router-dom";
import { getGetProgressQueryKey, useGetProgress } from "@workspace/api-client-react";
import { Offers } from "@/components/offers";
import { request, useTraining } from "@/lib/coaching";

/** Tier 2: streak, best lifts, weekly volume. Everyone else sees a blurred example and the offers. */
export function ProgressPage() {
  const training = useTraining();
  const tier2 = training.data?.access.level === "tier2";
  const progress = useGetProgress({ query: { queryKey: getGetProgressQueryKey(), enabled: tier2, retry: false }, request });
  const p = progress.data;

  if (training.isSuccess && !tier2) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Progress</h1>
        <div className="locked-preview" aria-hidden="true">
          <div className="stat-row"><div className="card stat"><span className="big-number">12</span><span className="label">Day streak</span></div><div className="card stat"><span className="big-number">31</span><span className="label">Sessions</span></div><div className="card stat"><span className="big-number">+18%</span><span className="label">Volume</span></div></div>
          <VolumeChart data={[{ week_start: "a", volume_kg: 40 }, { week_start: "b", volume_kg: 55 }, { week_start: "c", volume_kg: 52 }, { week_start: "d", volume_kg: 70 }, { week_start: "e", volume_kg: 82 }]} />
        </div>
        <p className="label" style={{ textAlign: "center" }}>Example only · track yours with Coaching</p>
        {training.data.access ? <Offers access={training.data.access} /> : null}
      </main>
    );
  }
  if (!p) return <main className="screen-scroll" aria-busy="true"><h1 className="screen-title">Progress</h1></main>;

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Progress</h1>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="card stat"><span className="big-number">{p.streak_days}</span><span className="label">Day streak</span></div>
        <div className="card stat"><span className="big-number">{p.sessions_done}</span><span className="label">Sessions</span></div>
      </div>
      {p.weekly_volume.length > 0 ? (
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <span className="label">Weekly volume (kg lifted)</span>
          <VolumeChart data={p.weekly_volume} />
        </div>
      ) : null}
      <h2 className="section-title" style={{ margin: 0 }}>Best lifts</h2>
      {p.best_lifts.length === 0 ? <p className="screen-copy">Log a weighted set and it shows here.</p> : null}
      <ul className="program-list">
        {p.best_lifts.map((b) => (
          <li key={b.exercise_id} className="card best-lift">
            <span>{b.name}</span><b className="big-number" style={{ fontSize: "1.5rem" }}>{b.load_kg} kg × {b.reps}</b>
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
