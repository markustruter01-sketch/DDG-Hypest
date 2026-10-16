import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import {
  getGetCurrentUserQueryKey,
  getListMyProgramsQueryKey,
  useListMyPrograms,
  useUpdateCurrentUser,
  type CurrentUser,
  type MyProgramSummary,
} from "@workspace/api-client-react";
import { Wordmark } from "@/components/wordmark";
import { formatUsd } from "@/lib/money";
import { useAppConfig } from "@/lib/config";
import { serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

/** Creator dashboard. Real data only: no sales exist until checkout is built. */
export function Studio({ user }: { user: CurrentUser }) {
  const mine = useListMyPrograms({
    query: { queryKey: getListMyProgramsQueryKey(), retry: false },
    request,
  });
  const programs = Array.isArray(mine.data) ? mine.data : null;

  return (
    <main className="screen-scroll">
      <div className="page-header">
        <Wordmark tone="dark" />
        <Link to="/profile" className="avatar" aria-label="Your profile">
          {user.display_name.trim().charAt(0).toUpperCase() || "?"}
        </Link>
      </div>

      {mine.isError ? <p className="error-text" role="alert">{serverErrorText(mine.error)}</p> : null}

      {programs ? (
        <>
          <Earnings />
          <Setup handle={user.handle} programs={programs} />
          {user.handle ? <LinkBar handle={user.handle} /> : null}
          <Stats programs={programs} />
          <Programs programs={programs} />
        </>
      ) : null}
    </main>
  );
}

/** Sales don't exist yet (no checkout). Shows the real figure, $0, and where the chart will be. */
function Earnings() {
  const month = new Date().toLocaleDateString("en-AU", { month: "short" });
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <span className="label">Kept · {month}</span>
      <div className="big-number" style={{ fontSize: "3.25rem" }}>$0</div>
      <svg viewBox="0 0 340 24" preserveAspectRatio="none" style={{ width: "100%", height: 24, display: "block", margin: "var(--space-2) 0" }} role="img" aria-label="Earnings chart, no sales yet">
        <path d="M0 18H340" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="4 6" />
        <rect x="0" y="14" width="8" height="8" fill="var(--color-ink)" />
      </svg>
      <span className="screen-copy" style={{ fontSize: "var(--size-small)" }}>Your first sale shows here</span>
    </div>
  );
}

type Step = { label: string; done: boolean; to: string };

/** Getting-started checklist. Disappears once everything needed to sell is done. */
function Setup({ handle, programs }: { handle: string | null; programs: MyProgramSummary[] }) {
  const first = programs[programs.length - 1];
  const withLessons = programs.find((p) => p.lesson_count > 0);
  const steps: Step[] = [
    { label: "Claim your link", done: handle !== null, to: "#claim" },
    { label: "Make a program", done: programs.length > 0, to: "/create?new=1" },
    { label: "Add a lesson", done: withLessons !== undefined, to: first ? `/create?program=${first.id}` : "/create?new=1" },
    { label: "Publish", done: programs.some((p) => p.status === "published"), to: `/create?program=${(withLessons ?? first)?.id ?? ""}` },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) {
    return null;
  }
  const next = steps.find((s) => !s.done);
  const circumference = 2 * Math.PI * 22;

  return (
    <div className="card" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${doneCount} of ${steps.length} steps done`}>
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--color-line)" strokeWidth="8" />
          <circle
            cx="28" cy="28" r="22" fill="none" stroke="var(--color-ink)" strokeWidth="8"
            strokeDasharray={`${(doneCount / steps.length) * circumference} ${circumference}`}
            transform="rotate(-90 28 28)"
          />
          <text x="28" y="34" textAnchor="middle" fontFamily="Anton" fontSize="17" fill="var(--color-ink)">{doneCount}/{steps.length}</text>
        </svg>
        <span className="section-title" style={{ margin: 0 }}>Ready to sell</span>
      </div>
      <ol className="checklist">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? "done" : undefined}>
            <span className="check" aria-hidden="true">{s.done ? <Check size={14} strokeWidth={3.5} /> : i + 1}</span>
            {s.label}
          </li>
        ))}
        <li className="soon"><span className="check" aria-hidden="true">5</span>Connect payouts<span className="label" style={{ marginLeft: "auto" }}>Soon</span></li>
      </ol>
      {next && next.to === "#claim" ? <ClaimLink /> : null}
      {next && next.to !== "#claim" ? (
        <Link className="primary-button" to={next.to} style={{ justifyContent: "space-between" }}>
          {next.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

function Stats({ programs }: { programs: MyProgramSummary[] }) {
  const live = programs.filter((p) => p.status === "published").length;
  const lessons = programs.reduce((sum, p) => sum + p.lesson_count, 0);
  return (
    <div className="stat-row">
      <div className="card stat"><span className="big-number">{programs.length}</span><span className="label">Programs</span></div>
      <div className="card stat"><span className="big-number">{live}</span><span className="label">Live</span></div>
      <div className="card stat"><span className="big-number">{lessons}</span><span className="label">Lessons</span></div>
    </div>
  );
}

function Programs({ programs }: { programs: MyProgramSummary[] }) {
  return (
    <>
      <div className="page-header">
        <h2 className="section-title" style={{ marginTop: 0 }}>Programs</h2>
        <Link className="icon-button" to="/create?new=1" aria-label="New program">
          <Plus size={18} strokeWidth={3} aria-hidden="true" />
        </Link>
      </div>
      {programs.length === 0 ? (
        <Link className="tile tile-empty" to="/create?new=1">
          <Plus size={22} strokeWidth={3} aria-hidden="true" />
          <span className="tile-title">New program</span>
        </Link>
      ) : (
        <div className="tile-row">
          {programs.map((p) => (
            <Link key={p.id} className="tile" to={`/create?program=${p.id}`}>
              <span className={`status-tag status-${p.status}`}>{p.status === "published" ? "Live" : "Draft"}</span>
              <span>
                <span className="tile-title" style={{ display: "block" }}>{p.title}</span>
                <span className="tile-meta">
                  {formatUsd(p.price_cents)} · {p.lesson_count} {p.lesson_count === 1 ? "lesson" : "lessons"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** The creator's own link. Sales through it pay the lower fee. Copies the full address. */
function LinkBar({ handle }: { handle: string }) {
  const config = useAppConfig();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/@${handle}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="link-bar">
      <span>
        <span className="label" style={{ display: "block", color: "var(--color-on-dark-muted)" }}>Your link{config ? ` · ${config.creator_brought_bps / 100}% fee` : ""}</span>
        <span className="tile-title">@{handle}</span>
      </span>
      <button className="secondary-button" type="button" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ClaimLink() {
  const queryClient = useQueryClient();
  const update = useUpdateCurrentUser({ request });
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const handle = value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
      setError("3–30 letters, numbers or _");
      return;
    }
    try {
      await update.mutateAsync({ data: { handle } });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label className="handle-input">
        <span aria-hidden="true">@</span>
        <input
          className="text-input"
          aria-label="Your link name"
          placeholder="yourname"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          required
        />
      </label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={update.isPending} style={{ justifyContent: "space-between" }}>
        Claim your link <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
