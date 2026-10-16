import { Link } from "react-router-dom";
import { Wordmark } from "@/components/wordmark";
import { formatUsd } from "@/lib/money";

const img = (name: string) => `${import.meta.env.BASE_URL}img/${name}`;

// Fee rates seeded in commission_rates (creator_brought 10%, hypest_found 20%).
const EXAMPLE_PRICE_CENTS = 2400;
const SPLITS = [
  { label: "Your link", feePct: 10 },
  { label: "Hypest found them", feePct: 20 },
];

const STEPS = [
  { n: "01", title: "Make a program", icon: "M4 5h16M4 12h16M4 19h10" },
  { n: "02", title: "Share your link", icon: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" },
  { n: "03", title: "Get paid", icon: "M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6" },
];

const STYLES = [
  { file: "yoga.jpg", label: "Yoga", alt: "Woman stretching outdoors" },
  { file: "run.jpg", label: "Running", alt: "Man running through a city" },
  { file: "strength.jpg", label: "Strength", alt: "Man smiling at a running track" },
];

/** Public landing page at "/" for anyone not logged in. Photos allowed: this is a hero page. */
export function LandingPage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <picture className="landing-hero-photo">
          <source media="(min-width: 900px)" srcSet={img("welcome-wide.jpg")} />
          <img src={img("welcome.jpg")} alt="Group of women training outdoors" />
        </picture>
        <div className="landing-inner landing-hero-content">
          <div className="page-header">
            <Wordmark tone="light" />
            <Link className="secondary-button" to="/login" style={{ minHeight: "var(--tap)" }}>
              Log in
            </Link>
          </div>
          <h1 className="hero-title">
            Sell your
            <br />
            training.
          </h1>
          <div className="hero-stats">
            <div><span className="big-number">$0</span><span className="label">To join</span></div>
            <div><span className="big-number">10%</span><span className="label">Your link fee</span></div>
          </div>
          <div className="button-row landing-ctas">
            <Link className="primary-button" to="/signup" style={{ justifyContent: "space-between" }}>
              Start selling <span aria-hidden="true">→</span>
            </Link>
            <Link className="secondary-button" to="/explore">
              I'm here to train
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <h2 className="landing-h2">How it works</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n} className="step">
                <span className="step-n">{s.n}</span>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
                  <path d={s.icon} />
                </svg>
                <span className="step-title">{s.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="landing-section landing-section-white">
        <div className="landing-inner">
          <h2 className="landing-h2">Where a {formatUsd(EXAMPLE_PRICE_CENTS).replace(".00", "")} sale goes</h2>
          <div className="splits">
            {SPLITS.map((s) => {
              const fee = Math.round((EXAMPLE_PRICE_CENTS * s.feePct) / 100);
              return (
                <div key={s.label}>
                  <div className="split-head">
                    <span>{s.label}</span>
                    <span>You {formatUsd(EXAMPLE_PRICE_CENTS - fee)}</span>
                  </div>
                  <div className="split-bar" role="img" aria-label={`${s.label}: you keep ${100 - s.feePct}%, Hypest ${s.feePct}%`}>
                    <span style={{ width: `${100 - s.feePct}%` }} />
                    <span className="split-fee" style={{ width: `${s.feePct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="label" style={{ marginTop: "var(--space-3)" }}>Before card fees</p>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <h2 className="landing-h2">Any kind of training</h2>
          <div className="style-grid">
            {STYLES.map((s) => (
              <figure key={s.file} className="style-tile">
                <img src={img(s.file)} alt={s.alt} loading="lazy" />
                <figcaption>{s.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-inner">
          <h2 className="hero-title" style={{ margin: "0 0 var(--space-5)" }}>Your first program, today.</h2>
          <Link className="primary-button" to="/signup" style={{ justifyContent: "space-between", maxWidth: "26rem" }}>
            Start selling <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-inner page-header">
          <Wordmark tone="dark" />
          <Link className="text-link" to="/explore">Explore</Link>
        </div>
      </footer>
    </main>
  );
}
