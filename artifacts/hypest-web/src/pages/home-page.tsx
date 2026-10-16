import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  getGetCurrentUserQueryKey,
  getListMyProgramsQueryKey,
  useGetCurrentUser,
  useListMyPrograms,
  useUpdateCurrentUser,
} from "@workspace/api-client-react";
import { Wordmark } from "@/components/wordmark";
import { formatUsd } from "@/lib/money";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };
const heroPhoto = `${import.meta.env.BASE_URL}img/welcome.jpg`;

/** "/" — Welcome hero when logged out, creator Studio when logged in. */
export function HomePage() {
  const me = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request,
  });

  if (me.isPending) {
    return <main className="screen-scroll" aria-busy="true" />;
  }
  if (me.isError && errorStatus(me.error) === 401) {
    return <Welcome />;
  }
  if (me.isError) {
    return (
      <main className="screen-scroll">
        <p className="error-text" role="alert">{serverErrorText(me.error)}</p>
      </main>
    );
  }
  return <Studio handle={me.data?.handle ?? null} />;
}

function Welcome() {
  return (
    <main className="hero">
      <div
        className="hero-photo"
        role="img"
        aria-label="Group of women training outdoors"
        style={{
          backgroundImage: `linear-gradient(rgb(14 14 14 / 5%) 30%, rgb(14 14 14 / 55%) 62%, var(--color-dark) 100%), url("${heroPhoto}")`,
        }}
      />
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
      <div className="button-row">
        <Link className="primary-button" to="/signup" style={{ justifyContent: "space-between" }}>
          Start selling <span aria-hidden="true">→</span>
        </Link>
        <Link className="secondary-button" to="/explore">
          I'm here to train
        </Link>
      </div>
    </main>
  );
}

function Studio({ handle }: { handle: string | null }) {
  const mine = useListMyPrograms({
    query: { queryKey: getListMyProgramsQueryKey(), retry: false },
    request,
  });
  const programs = Array.isArray(mine.data) ? mine.data : null;
  const live = programs?.filter((p) => p.status === "published").length ?? 0;
  const lessons = programs?.reduce((sum, p) => sum + p.lesson_count, 0) ?? 0;

  return (
    <main className="screen-scroll">
      <div className="page-header">
        <Wordmark tone="dark" />
      </div>

      {mine.isError ? <p className="error-text" role="alert">{serverErrorText(mine.error)}</p> : null}

      {programs ? (
        <>
          <div className="stat-row">
            <div className="card stat"><span className="big-number">{programs.length}</span><span className="label">Programs</span></div>
            <div className="card stat"><span className="big-number">{live}</span><span className="label">Live</span></div>
            <div className="card stat"><span className="big-number">{lessons}</span><span className="label">Lessons</span></div>
          </div>

          {handle ? <LinkBar handle={handle} /> : <ClaimLink />}

          <div className="page-header">
            <h2 className="section-title" style={{ marginTop: 0 }}>Programs</h2>
            <Link className="icon-button" to="/create?new=1" aria-label="New program">
              <Plus size={18} strokeWidth={3} aria-hidden="true" />
            </Link>
          </div>

          {programs.length === 0 ? (
            <Link className="primary-button" to="/create?new=1">
              Make your first program
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
      ) : null}
    </main>
  );
}

/** The creator's own link. Sales through it pay the lower fee. */
function LinkBar({ handle }: { handle: string }) {
  const url = `${window.location.host}/@${handle}`;
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
      <span>{url}</span>
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
    <form className="account-form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Claim your link</span>
        <span className="handle-input">
          <span>{window.location.host}/@</span>
          <input
            className="text-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            required
          />
        </span>
      </label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <button className="secondary-button" type="submit" disabled={update.isPending}>
        Claim
      </button>
    </form>
  );
}
