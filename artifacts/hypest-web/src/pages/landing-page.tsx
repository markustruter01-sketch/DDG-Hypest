import { Link } from "react-router-dom";
import { Activity, CalendarCheck, LifeBuoy, Repeat, ShieldCheck } from "lucide-react";
import { LegalLinks } from "@/pages/legal-page";
import { Wordmark } from "@/components/wordmark";
import { ShowMe } from "@/components/show-me";
import { useAppConfig } from "@/lib/config";
import { img, money, useCoaches } from "@/lib/coaching";

const FEATURES = [
  { Icon: CalendarCheck, word: "Built for you", note: "Your goal, days, kit" },
  { Icon: Activity, word: "Log every set", note: "Weights, reps, streaks" },
  { Icon: Repeat, word: "Adapts", note: "Each block builds on the last" },
  { Icon: LifeBuoy, word: "Swaps", note: "Sore? A gentler move" },
  { Icon: ShieldCheck, word: "Safety stop", note: "Warning signs pause the plan" },
];

/** Public landing page for the AI-coach app. Photos allowed: hero page. */
export function LandingPage() {
  const config = useAppConfig();
  const coaches = useCoaches();
  const p = config?.prices;

  return (
    <main className="landing">
      <section className="landing-hero">
        <picture className="landing-hero-photo">
          <source media="(min-width: 900px)" srcSet={img("welcome-wide.webp")} />
          <img src={img("welcome.webp")} alt="Group of women training outdoors" />
        </picture>
        <div className="landing-inner landing-hero-content">
          <div className="page-header">
            <Wordmark tone="light" />
            <Link className="secondary-button" to="/login" style={{ minHeight: "var(--tap)" }}>Log in</Link>
          </div>
          <h1 className="hero-title">Your coach.<br />Your plan.<br />Every week.</h1>
          <div className="hero-stats">
            <div><span className="big-number">{p ? money(p.intro_plan_cents) : "–"}</span><span className="label">First plan</span></div>
            <div><span className="big-number">{coaches.data?.length ?? "–"}</span><span className="label">AI coaches</span></div>
          </div>
          <div className="button-row landing-ctas">
            <Link className="primary-button" to="/coaches" style={{ justifyContent: "space-between" }}>Meet your coach <span aria-hidden="true">→</span></Link>
            <a className="secondary-button" href="#show-me">See how it works</a>
          </div>
        </div>
      </section>

      <section className="landing-section" id="show-me">
        <div className="landing-inner">
          <h2 className="landing-h2">See it work</h2>
          <ShowMe />
        </div>
      </section>

      <section className="landing-section landing-section-white">
        <div className="landing-inner">
          <h2 className="landing-h2">What you get</h2>
          <div className="feature-grid">
            {FEATURES.map(({ Icon, word, note }) => (
              <div key={word} className="feature">
                <Icon size={26} aria-hidden="true" />
                <b>{word}</b>
                <span className="screen-copy">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <h2 className="landing-h2">Meet the coaches</h2>
          <div className="tile-row landing-coaches">
            {coaches.data?.map((c) => (
              <Link key={c.id} to={`/coaches/${c.id}`} className="coach-card" style={{ width: "11rem", flex: "none", backgroundImage: `linear-gradient(rgb(14 14 14 / 0%) 35%, rgb(14 14 14 / 85%)), url("${img(c.photo)}")` }}>
                <span className="ai-tag">AI coach</span>
                <span className="coach-card-name">{c.name}</span>
                <span className="tile-meta">{c.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {p ? (
        <section className="landing-section landing-section-white">
          <div className="landing-inner">
            <h2 className="landing-h2">Simple pricing</h2>
            <div className="price-grid">
              <div className="price"><span className="label">Free</span><b>$0</b><span className="screen-copy">Try your first week</span></div>
              <div className="price"><span className="label">Starter</span><b>{money(p.tier1_cents)}<small>/mo</small></b><span className="screen-copy">A new plan every month</span></div>
              <div className="price price-best"><span className="label">Coaching · Best value</span><b>{money(p.tier2_cents)}<small>/mo</small></b><span className="screen-copy">Plans that adapt, swaps, meal plans</span></div>
              <div className="price"><span className="label">Pro</span><b>{money(p.tier3_cents)}<small>/mo</small></b><span className="screen-copy">The most coaching, monthly reports</span></div>
            </div>
            <p className="label" style={{ marginTop: "var(--space-3)" }}>US$</p>
          </div>
        </section>
      ) : null}

      <section className="landing-section">
        <div className="landing-inner safety">
          <ShieldCheck size={32} aria-hidden="true" />
          <div>
            <h2 className="landing-h2" style={{ marginBottom: "var(--space-2)" }}>Safe by design</h2>
            <p className="screen-copy">Every exercise comes from Hypest's own list. Every plan is checked by code before you see it. Warning signs pause your plan and send you to a doctor. Hypest is not medical advice; your health and safety are your call, and we do our part.</p>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-inner">
          <h2 className="hero-title" style={{ margin: "0 0 var(--space-5)" }}>Start today.</h2>
          <Link className="primary-button" to="/coaches" style={{ justifyContent: "space-between", maxWidth: "26rem" }}>Meet your coach <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-inner page-header">
          <Wordmark tone="dark" />
          <Link className="text-link" to="/login">Log in</Link>
        </div>
        <div className="landing-inner">
          <LegalLinks />
        </div>
      </footer>
    </main>
  );
}
