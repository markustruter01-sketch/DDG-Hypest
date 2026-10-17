import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { img } from "@/lib/coaching";

/**
 * "Show me" animation for sceptics: six scenes on a phone, looping. Built from the app's own
 * styles (no video), so it is crisp and light. Example content only, labelled as such.
 */
// line = the one-liner shown on the phone like a subtitle. coaching = needs the Coaching tier.
const SCENES = [
  { title: "Pick a coach", line: "Choose the coach whose style suits you.", coaching: false },
  { title: "Tap 6 answers", line: "Six quick taps. No long forms.", coaching: false },
  { title: "Your plan, built", line: "A 4-week plan built around you.", coaching: false },
  { title: "Train and log", line: "Follow along. Log every set.", coaching: true },
  { title: "Hurts? Swap it", line: "Something sore? Get a gentler move.", coaching: true },
  { title: "Grow every block", line: "Your next plan builds on your results.", coaching: true },
] as const;
const SCENE_MS = 3200;

export function ShowMe() {
  const [scene, setScene] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!auto || reduce) return;
    const t = setInterval(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearInterval(t);
  }, [auto]);

  const current = SCENES[scene] ?? SCENES[0];

  return (
    <div className="showme">
      <div className="phone" aria-hidden="true">
        <div className="phone-screen" key={scene}>
          {scene === 0 ? <ScenePick /> : null}
          {scene === 1 ? <SceneTell /> : null}
          {scene === 2 ? <ScenePlan /> : null}
          {scene === 3 ? <SceneTrain /> : null}
          {scene === 4 ? <SceneSwap /> : null}
          {scene === 5 ? <SceneGrow /> : null}
          <span className="sc-sub">{current.line}</span>
        </div>
      </div>
      <div className="showme-caption" aria-live="polite">
        <span className="label">{scene + 1} / {SCENES.length} · example{current.coaching ? " · Coaching" : ""}</span>
        <span className="showme-title">{current.title}</span>
        <span className="sr-only">{current.line}</span>
        <div className="showme-dots" role="tablist" aria-label="Scenes">
          {SCENES.map((s, i) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === scene} aria-label={s.title} className={i === scene ? "on" : undefined} onClick={() => { setAuto(false); setScene(i); }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScenePick() {
  const coaches = [["Mara", "coach-mara.svg"], ["Rex", "coach-rex.svg"], ["Jade", "coach-jade.svg"], ["Kip", "coach-kip.svg"]] as const;
  return (
    <div className="sc sc-pick">
      <span className="sc-h">Pick your coach</span>
      <div className="sc-cards">
        {coaches.map(([name, photo], i) => (
          <div key={name} className={i === 1 ? "sc-card sc-card-on" : "sc-card"} style={{ backgroundImage: `linear-gradient(transparent 40%, rgb(14 14 14 / 85%)), url("${img(photo)}")`, animationDelay: `${i * 120}ms` }}>
            <span>{name}</span>
          </div>
        ))}
      </div>
      <span className="sc-tap" />
    </div>
  );
}

function SceneTell() {
  const rows = [["Build muscle", "Lose fat"], ["Some", "New"], ["3 days", "4 days"], ["45 min", "30 min"], ["Dumbbells", "None"], ["Knee", "Back"]] as const;
  return (
    <div className="sc">
      <span className="sc-hi"><img src={img("coach-rex.svg")} alt="" /><span className="sc-h">Hi, I'm Rex.</span></span>
      {rows.map((r, i) => (
        <div key={r[0]} className="sc-chips">
          <span className="sc-chip sc-chip-pick" style={{ animationDelay: `${250 + i * 380}ms` }}>{r[0]}</span>
          <span className="sc-chip">{r[1]}</span>
        </div>
      ))}
    </div>
  );
}

function ScenePlan() {
  const days = [["Day 1", "Goblet squat → Glute bridge"], ["Day 2", "Dumbbell row · Floor press"], ["Day 3", "Step-up → Hip thrust"]] as const;
  return (
    <div className="sc">
      <span className="sc-h">Your week 1</span>
      {days.map(([d, t], i) => (
        <div key={d} className="sc-day" style={{ animationDelay: `${200 + i * 350}ms` }}>
          <b>{d}</b><span>{t}</span>
        </div>
      ))}
      <span className="sc-badge" style={{ animationDelay: "1400ms" }}><Check size={12} strokeWidth={3.5} /> Knee-friendly swaps</span>
    </div>
  );
}

function SceneTrain() {
  return (
    <div className="sc sc-dark">
      <span className="sc-h">Goblet squat</span>
      <span className="sc-big">3 × 10</span>
      {[1, 2, 3].map((n) => (
        <div key={n} className="sc-set">
          <span>{n}</span><b>16 kg</b><b>10</b>
          <span className="sc-tick" style={{ animationDelay: `${400 + n * 500}ms` }}><Check size={12} strokeWidth={3.5} /></span>
        </div>
      ))}
      <div className="sc-rest"><span>Rest</span><i /></div>
    </div>
  );
}

function SceneSwap() {
  return (
    <div className="sc sc-dark">
      <span className="sc-h">This hurts?</span>
      <div className="sc-swap-from">Back squat</div>
      <span className="sc-arrow">↓</span>
      <div className="sc-swap-to">Reverse lunge</div>
      <span className="sc-note">Easier on the back. Swapped for the rest of your plan.</span>
    </div>
  );
}

function SceneGrow() {
  return (
    <div className="sc">
      <span className="sc-h">Getting stronger</span>
      <svg viewBox="0 0 200 110" className="sc-chart">
        <path d="M0 100H200" stroke="var(--color-line)" />
        <path className="sc-line" d="M5 92 L45 80 L85 72 L125 55 L165 38 L195 20" fill="none" stroke="var(--color-ink)" strokeWidth="3" strokeLinejoin="round" />
        <circle className="sc-dot" cx="195" cy="20" r="6" fill="var(--color-volt)" stroke="var(--color-ink)" strokeWidth="2" />
      </svg>
      <div className="sc-day" style={{ animationDelay: "1500ms" }}><b>Block 2</b><span>Goblet squat 16 → 17 kg</span></div>
    </div>
  );
}
