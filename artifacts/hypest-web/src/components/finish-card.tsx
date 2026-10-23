import { useState } from "react";
import { Share2 } from "lucide-react";

export type FinishStats = { week: number; day: number; exercises: number; setsDone: number; setsTotal: number; minutes: number | null; volume: number | null; units: string };

/** End of a session: what you did, what's next, and a one-tap share (phone share sheet, or copy on a computer). */
export function FinishCard({ stats, coachName, next, onDone }: { stats: FinishStats; coachName: string; next: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Week ${stats.week} · Day ${stats.day} done with ${coachName} on Hypest.`;

  async function share() {
    const url = window.location.origin;
    if (navigator.share) {
      await navigator.share({ title: "Hypest", text, url }).catch(() => undefined); // closing the sheet is not an error
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const tiles: [string, string][] = [
    [String(stats.exercises), "Exercises"],
    [`${stats.setsDone}/${stats.setsTotal}`, "Sets ticked"],
    ...(stats.minutes !== null ? [[String(stats.minutes), "Minutes"] as [string, string]] : []),
    ...(stats.volume ? [[stats.volume.toLocaleString(), `${stats.units} lifted`] as [string, string]] : []),
  ];

  return (
    <main className="player finish">
      <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>Week {stats.week} · Day {stats.day}</span>
      <h1 className="hero-title finish-title">Session<br />done</h1>
      <div className="finish-stats">
        {tiles.map(([n, label]) => (
          <div key={label}><b className="big-number">{n}</b><span className="label">{label}</span></div>
        ))}
      </div>
      <p className="player-body">{next}</p>
      <div className="player-nav">
        <button className="secondary-button" type="button" onClick={share}><Share2 size={16} aria-hidden="true" /> {copied ? "Copied" : "Share"}</button>
        <button className="primary-button" type="button" onClick={onDone}>Done</button>
      </div>
    </main>
  );
}
