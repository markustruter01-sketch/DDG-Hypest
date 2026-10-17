import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Offers } from "@/components/offers";
import { coachById, dose, useCoaches, useTraining } from "@/lib/coaching";
import { nextSession } from "@/pages/today-page";

/** The 4-week block: week tabs, then each day's exercises. */
export function PlanPage() {
  const training = useTraining();
  const coaches = useCoaches();
  const plan = training.data?.plan ?? null;
  const upNext = plan ? nextSession(plan) : null;
  const [week, setWeek] = useState<number | null>(null);
  const shown = week ?? upNext?.week ?? 1;
  const coach = coachById(coaches.data, plan?.coach_id);

  if (training.isSuccess && !plan) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Plan</h1>
        {training.data.profile ? (
          <Offers access={training.data.access} />
        ) : (
          <Link className="primary-button" to="/coaches">Meet your coach</Link>
        )}
      </main>
    );
  }
  if (!plan) return <main className="screen-scroll" aria-busy="true" />;

  return (
    <main className="screen-scroll">
      <div className="page-header">
        <h1 className="screen-title">Block {plan.block}</h1>
        <span className="label">{coach?.name ?? ""} · {plan.days_per_week} days</span>
      </div>
      <div className="week-tabs" role="tablist">
        {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) => {
          const all = plan.sessions.filter((s) => s.week === w);
          const finished = all.length > 0 && all.every((s) => s.completed_at);
          return (
            <button key={w} type="button" role="tab" aria-selected={w === shown} className={w === shown ? "week-tab week-tab-on" : "week-tab"} onClick={() => setWeek(w)}>
              W{w}{finished ? <Check size={12} strokeWidth={3.5} /> : null}
            </button>
          );
        })}
      </div>
      {plan.sessions.filter((s) => s.week === shown).map((s) => (
        <Link key={s.id ?? s.day} to={s.id ? `/session/${s.id}` : "#"} className={s.completed_at ? "card plan-day plan-day-done" : s.id === upNext?.id ? "card plan-day plan-day-next" : "card plan-day"}>
          <div className="page-header">
            <span className="tile-title" style={{ color: "var(--color-ink)" }}>Day {s.day}</span>
            <span className="label">{s.completed_at ? "Done" : s.id === upNext?.id ? "Up next" : `${s.items.length} exercises`}</span>
          </div>
          <ul>
            {s.items.map((it) => <li key={it.id ?? it.exercise_id}><span>{it.name}</span><b>{dose(it)}</b></li>)}
          </ul>
        </Link>
      ))}
    </main>
  );
}
