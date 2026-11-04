import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Offers } from "@/components/offers";
import { coachById, coachLine, img, useCoaches, useTraining } from "@/lib/coaching";
import { useAppConfig } from "@/lib/config";
import { CoachChat } from "@/components/coach-chat";

/** Your coach: a full-screen chat for Plans and Coaching members (AI on); otherwise who they are and the offers. */
export function CoachTabPage() {
  const training = useTraining();
  const coaches = useCoaches();
  const state = training.data;
  const config = useAppConfig();
  const coach = coachById(coaches.data, state?.plan?.coach_id ?? state?.profile?.coach_id);

  if (training.isSuccess && !coach) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Coach</h1>
        <Link className="primary-button" to="/coaches">Meet the coaches</Link>
      </main>
    );
  }
  if (!coach || !state) return <main className="screen-scroll" aria-busy="true" />;
  const tier2 = state.access.level === "tier2";
  const hasChat = state.access.level === "tier1" || tier2;

  // Build plan 2.4: with chat (Plans or Coaching, AI on) the Coach tab is a full-screen chat.
  if (hasChat && config?.ai) {
    return (
      <main className="coach-page coach-page-chat">
        <header className="chat-head">
          <img className="avatar" src={img(coach.photo)} alt="" aria-hidden="true" />
          <span><b>{coach.name}</b><br /><span className="label">AI coach · {coach.personality}</span></span>
          <Link className="text-link" to="/coaches">Change</Link>
        </header>
        <CoachChat coach={coach} />
      </main>
    );
  }

  return (
    <main className="coach-page">
      <section className="coach-hero" style={{ height: "16rem", backgroundImage: `linear-gradient(rgb(14 14 14 / 0%) 40%, var(--color-page) 100%), url("${img(coach.photo)}")` }} />
      <section className="coach-body">
        <span className="ai-tag ai-tag-dark">AI coach</span>
        <h1 className="hero-title" style={{ margin: 0, fontSize: "3rem", color: "var(--color-ink)" }}>{coach.name}</h1>
        <p className="screen-copy">“{coachLine(coach.id)}”</p>
        <div className="coach-facts">
          <div><span className="label">Style</span><b>{coach.personality}</b></div>
          <div><span className="label">Your plan</span><b>{state.plan ? `Block ${state.plan.block}` : "Not started"}</b></div>
        </div>
        <div className={hasChat ? "card chat-soon" : "card chat-soon locked"}>
          <MessageCircle size={22} aria-hidden="true" />
          <span><b>Chat with {coach.name}</b><br /><span className="label">{hasChat ? "Coming soon" : "Part of Plans and Coaching"}</span></span>
        </div>
        {!tier2 ? <Offers access={state.access} /> : null}
        <Link className="secondary-button" to="/coaches">Change coach</Link>
      </section>
    </main>
  );
}
