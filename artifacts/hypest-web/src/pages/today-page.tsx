import type { ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Play } from "lucide-react";
import {
  getGetTrainingQueryKey,
  useCreateNextPlan,
  useCreatePlan,
  useResumePlan,
  type CurrentUser,
  type PlanView,
} from "@workspace/api-client-react";
import { Wordmark } from "@/components/wordmark";
import { Offers } from "@/components/offers";
import { coachById, coachLine, img, request, useCoaches, useTraining } from "@/lib/coaching";
import { quoteOfTheDay } from "@/lib/quotes";
import { serverErrorText } from "@/lib/server-error";

function greeting(now = new Date()): string {
  const hour = (now.getUTCHours() + 10) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function nextSession(plan: PlanView) {
  return plan.sessions.find((s) => !s.completed_at) ?? null;
}

/** Today: one screen, one job. What do I do now, and how am I tracking? */
export function TodayPage({ user }: { user: CurrentUser }) {
  const training = useTraining();
  const coaches = useCoaches();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useCreatePlan({ request });
  const next = useCreateNextPlan({ request });
  const resume = useResumePlan({ request });
  const state = training.data;
  const coach = coachById(coaches.data, state?.plan?.coach_id ?? state?.profile?.coach_id);
  const firstName = user.display_name.trim().split(/\s+/)[0] ?? "";
  const quote = quoteOfTheDay();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh(); } catch { await refresh(); } };

  const plan = state?.plan ?? null;
  const upNext = plan ? nextSession(plan) : null;
  const week = upNext?.week ?? plan?.weeks ?? 1;
  const thisWeek = plan?.sessions.filter((s) => s.week === week) ?? [];
  const done = plan?.sessions.filter((s) => s.completed_at).length ?? 0;
  const total = plan?.sessions.length ?? 0;

  let main: ReactElement;
  if (!state) {
    main = <div className="today-card" aria-busy="true" />;
  } else if (!state.profile) {
    main = (
      <Link to="/coaches" className="today-card today-go">
        <span className="label">Start here</span>
        <span className="today-big">Meet your coach</span>
        <span className="today-play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
      </Link>
    );
  } else if (!plan) {
    const canStart = state.access.level === "tier1" || state.access.level === "tier2" || state.access.plan_credits > 0;
    main = canStart ? (
      <button type="button" className="today-card today-go" onClick={() => run(() => create.mutateAsync())} disabled={create.isPending}>
        <span className="label">{coach?.name ?? "Your coach"} is ready</span>
        <span className="today-big">Build my plan</span>
        <span className="today-play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
      </button>
    ) : (
      <div className="today-offers"><Offers access={state.access} onUnlocked={() => run(() => create.mutateAsync())} /></div>
    );
  } else if (plan.status === "paused") {
    main = (
      <div className="today-card today-stop">
        <span className="label">Plan paused for your safety</span>
        <span className="today-mid">See a doctor or physio before training again.</span>
        <button type="button" className="secondary-button" onClick={() => run(() => resume.mutateAsync())} disabled={resume.isPending}>I've been cleared · resume</button>
      </div>
    );
  } else if (!upNext) {
    const canNext = state.access.level === "tier1" || state.access.level === "tier2" || state.access.plan_credits > 0;
    main = canNext ? (
      <button type="button" className="today-card today-go" onClick={() => run(() => next.mutateAsync())} disabled={next.isPending}>
        <span className="label">Block {plan.block} done · {done} sessions</span>
        <span className="today-big">Build block {plan.block + 1}</span>
        <span className="today-play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
      </button>
    ) : (
      <div className="today-offers"><span className="label">Block done. Keep going?</span><Offers access={state.access} onUnlocked={() => run(() => next.mutateAsync())} /></div>
    );
  } else {
    main = (
      <button type="button" className="today-card today-go" onClick={() => upNext.id && navigate(`/session/${upNext.id}`)}>
        <span className="label">Week {upNext.week} · Day {upNext.day} · {upNext.items.length} exercises</span>
        <span className="today-big">Start session</span>
        <span className="today-play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
      </button>
    );
  }

  return (
    <main className="home">
      <section className="home-hero">
        <img className="home-hero-photo" src={img(coach?.photo ?? "welcome.jpg")} alt="" aria-hidden="true" />
        <div className="home-hero-top page-header">
          <Wordmark tone="light" />
          <Link to="/profile" className="avatar avatar-light" aria-label="Your profile">{firstName.charAt(0).toUpperCase() || "?"}</Link>
        </div>
      </section>

      <section className="home-copy">
        <span className="label rise" style={{ animationDelay: "60ms" }}>{greeting()}{firstName ? `, ${firstName}` : ""}</span>
        <blockquote className="home-quote rise" style={{ animationDelay: "140ms" }}>{coach ? coachLine(coach.id) : "Your coach. Your plan. Every week."}</blockquote>
        {coach ? <span className="home-quote-by rise" style={{ animationDelay: "220ms" }}>{coach.name} · AI coach</span> : null}
      </section>

      <section className="today-main rise" style={{ animationDelay: "280ms" }}>
        {main}
        {plan ? (
          <div className="week-strip" aria-label={`Week ${week}`}>
            {thisWeek.map((s) => (
              <span key={s.day} className={s.completed_at ? "dot dot-done" : s.id === upNext?.id ? "dot dot-next" : "dot"}>
                {s.completed_at ? <Check size={14} strokeWidth={3.5} /> : s.day}
              </span>
            ))}
            <span className="week-strip-meta label">{done}/{total} done</span>
          </div>
        ) : null}
        {create.isError || next.isError ? <p className="error-text" role="alert">{serverErrorText(create.error ?? next.error)}</p> : null}
      </section>

      <p className="today-quote">“{quote.text}” <span>— {quote.by}</span></p>
    </main>
  );
}
