import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { getListPastPlansQueryKey, useListPastPlans, type Coach, type PastPlan } from "@workspace/api-client-react";
import { Offers } from "@/components/offers";
import { coachById, dose, request, useCoaches, useTraining } from "@/lib/coaching";
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
  const history = useListPastPlans({ query: { queryKey: getListPastPlansQueryKey(), enabled: training.isSuccess }, request });

  if (training.isSuccess && !plan) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Plan</h1>
        {training.data.profile ? (
          <Offers access={training.data.access} />
        ) : (
          <Link className="primary-button" to="/coaches">Meet your coach</Link>
        )}
        <PastBlocks plans={history.data} coaches={coaches.data} />
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
      {plan.intro ? <p className="coach-intro">“{plan.intro}” <span className="label">{coach?.name ?? ""} · AI coach</span></p> : null}
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
          {s.note ? <p className="session-note">{s.note}</p> : null}
          <ul>
            {s.items.map((it) => <li key={it.id ?? it.exercise_id}><span>{it.name}</span><b>{dose(it)}</b></li>)}
          </ul>
        </Link>
      ))}
      <PastBlocks plans={history.data} coaches={coaches.data} />
    </main>
  );
}

/** Earlier blocks: which coach, when, how many sessions were done. */
function PastBlocks({ plans, coaches }: { plans: PastPlan[] | undefined; coaches: Coach[] | undefined }) {
  if (!plans?.length) return null;
  return (
    <section className="past-blocks">
      <h2 className="section-title" style={{ margin: 0 }}>Past blocks</h2>
      {plans.map((p) => (
        <div key={p.id} className="card past-block">
          <span>
            <b>Block {p.block}</b>
            <span className="label" style={{ display: "block" }}>
              {coachById(coaches, p.coach_id)?.name ?? ""} · {new Date(p.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </span>
          <span className="label">{p.sessions_done}/{p.sessions_total} done</span>
        </div>
      ))}
    </section>
  );
}
