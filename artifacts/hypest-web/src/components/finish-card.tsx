import { useState } from "react";
import { Share2 } from "lucide-react";
import { drawShareImage, shareImage } from "@/lib/share-image";

export type FinishStats = { week: number; day: number; exercises: number; setsDone: number; setsTotal: number; minutes: number | null; volume: number | null; units: string };

/** End of a session: what you did, what's next, and a one-tap share (phone share sheet, or copy on a computer). */
export function FinishCard({ stats, coachName, coachId, firstName, next, onDone }: { stats: FinishStats; coachName: string; coachId: string; firstName: string | null; next: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  // Spec 3.1 §9: the first name and the weights are left out unless the member ticks them.
  const [withName, setWithName] = useState(false);
  const [withWeights, setWithWeights] = useState(false);

  async function share() {
    const lines = [`${stats.exercises} exercises · ${stats.setsDone} sets`, ...(stats.minutes !== null ? [`${stats.minutes} minutes`] : []),
      ...(withWeights && stats.volume ? [`${stats.volume.toLocaleString()} ${stats.units} lifted`] : [])];
    try {
      const blob = await drawShareImage({ coachId, coachName, kicker: `Week ${stats.week} · Day ${stats.day}`, title: "Session done", lines, firstName: withName ? firstName : null });
      setCopied((await shareImage(blob)) === "downloaded");
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
      <div className="share-options">
        {firstName ? <label className="check-row"><input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} /> Add my first name</label> : null}
        {stats.volume ? <label className="check-row"><input type="checkbox" checked={withWeights} onChange={(e) => setWithWeights(e.target.checked)} /> Add weights</label> : null}
      </div>
      <div className="player-nav">
        <button className="secondary-button" type="button" onClick={share}><Share2 size={16} aria-hidden="true" /> {copied ? "Saved" : "Share"}</button>
        <button className="primary-button" type="button" onClick={onDone}>Done</button>
      </div>
    </main>
  );
}
