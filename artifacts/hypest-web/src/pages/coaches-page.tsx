import { Link, Navigate, useParams } from "react-router-dom";
import { GOAL_LABEL, coachById, img, useCoaches } from "@/lib/coaching";

/** Pick a coach. Photos: this is a hero page. Every card says AI coach, so nobody mistakes the photo for a person. */
export function CoachesPage() {
  const coaches = useCoaches();
  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Pick your coach</h1>
      <div className="coach-grid">
        {coaches.data?.map((c, i) => (
          <Link key={c.id} to={`/coaches/${c.id}`} className="coach-card rise" style={{ animationDelay: `${i * 70}ms`, backgroundImage: `linear-gradient(rgb(14 14 14 / 0%) 35%, rgb(14 14 14 / 85%)), url("${img(c.photo)}")` }}>
            <span className="ai-tag">AI coach</span>
            <span className="coach-card-name">{c.name}</span>
            <span className="tile-meta">{c.title}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function CoachPage() {
  const { coachId } = useParams();
  const coaches = useCoaches();
  const coach = coachById(coaches.data, coachId);
  if (coaches.isSuccess && !coach) return <Navigate to="/coaches" replace />;
  if (!coach) return <main className="screen-scroll" aria-busy="true" />;
  return (
    <main className="coach-page">
      <section className="coach-hero" style={{ backgroundImage: `linear-gradient(rgb(14 14 14 / 20%), rgb(14 14 14 / 0%) 40%, var(--color-page) 100%), url("${img(coach.photo)}")` }}>
        <Link className="text-link" to="/coaches" style={{ color: "var(--color-on-dark)" }}>← Coaches</Link>
      </section>
      <section className="coach-body">
        <span className="ai-tag ai-tag-dark">AI coach</span>
        <h1 className="hero-title" style={{ margin: 0, fontSize: "3.5rem", color: "var(--color-ink)" }}>{coach.name}</h1>
        <p className="label">{coach.title}</p>
        <div className="coach-facts">
          <div><span className="label">Style</span><b>{coach.personality}</b></div>
          <div><span className="label">Good for</span><b>{coach.good_for}</b></div>
        </div>
        <div className="chips" aria-label="Goals">
          {coach.goals.map((g) => <span key={g} className="chip chip-static">{GOAL_LABEL[g] ?? g}</span>)}
        </div>
        <Link className="primary-button" to={`/start/${coach.id}`} style={{ justifyContent: "space-between" }}>
          Train with {coach.name} <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
