import { Link, useParams, useSearchParams } from "react-router-dom";
import { getGetLibraryProgramQueryKey, useGetLibraryProgram, type Lesson } from "@workspace/api-client-react";
import { errorStatus, serverErrorText } from "@/lib/server-error";
import { youtubeId } from "@/lib/youtube";

const request = { credentials: "include" as const };

/** Workout player: one lesson at a time, dark full screen. Lesson number lives in ?l= so back/forward work. */
export function PlayerPage() {
  const params = useParams();
  const programId = Number(params.programId);
  const valid = Number.isInteger(programId) && programId > 0;
  const [search, setSearch] = useSearchParams();
  const program = useGetLibraryProgram(valid ? programId : 0, {
    query: { queryKey: getGetLibraryProgramQueryKey(valid ? programId : 0), enabled: valid, retry: false },
    request,
  });

  if (!valid || program.isError) {
    const status = program.isError ? errorStatus(program.error) : 404;
    return (
      <main className="player">
        <Link className="text-link" to="/library" style={{ color: "var(--color-on-dark)" }}>← Library</Link>
        <p className="error-text" style={{ color: "#ff8a80" }}>
          {status === 403 ? "You haven't bought this program" : status === 404 ? "Program not found" : serverErrorText(program.error)}
        </p>
        {status === 403 ? <Link className="primary-button" to={`/explore/${programId}`}>See program</Link> : null}
      </main>
    );
  }
  if (!program.data) {
    return <main className="player" aria-busy="true" />;
  }

  const lessons = [...program.data.lessons].sort((a, b) => a.position - b.position);
  const total = lessons.length;
  const index = Math.min(Math.max(Number(search.get("l") ?? 1) || 1, 1), Math.max(total, 1)) - 1;
  const lesson = lessons[index];
  const go = (n: number) => setSearch({ l: String(n + 1) });
  const back = program.data.is_creator ? `/create?program=${programId}` : "/library";

  return (
    <main className="player">
      <div className="page-header">
        <Link className="text-link" to={back} style={{ color: "var(--color-on-dark)" }}>← {program.data.is_creator ? "Editor" : "Library"}</Link>
        <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{total === 0 ? "" : `${index + 1} / ${total}`}</span>
      </div>
      <div className="progress" role="img" aria-label={`Lesson ${index + 1} of ${total}`}>
        {lessons.map((l, i) => (
          <span key={l.id} className={i <= index ? "on" : undefined} />
        ))}
      </div>
      <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{program.data.title}</span>

      {lesson ? <LessonView lesson={lesson} /> : <p className="screen-copy">No lessons yet</p>}

      <div className="player-nav">
        <button className="secondary-button" type="button" onClick={() => go(index - 1)} disabled={index === 0}>
          ← Back
        </button>
        {index < total - 1 ? (
          <button className="primary-button" type="button" onClick={() => go(index + 1)}>
            Next →
          </button>
        ) : (
          <Link className="primary-button" to={back}>Done ✓</Link>
        )}
      </div>
    </main>
  );
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const video = lesson.media_source === "youtube" ? youtubeId(lesson.media_ref) : null;
  const metrics = [
    lesson.sets !== null ? { value: String(lesson.sets), label: "Sets" } : null,
    lesson.reps !== null ? { value: String(lesson.reps), label: "Reps" } : null,
    lesson.duration_seconds !== null ? { value: formatDuration(lesson.duration_seconds), label: "Time" } : null,
  ].filter((m): m is { value: string; label: string } => m !== null);

  return (
    <>
      <h1 className="hero-title" style={{ margin: 0, fontSize: "2.5rem" }}>{lesson.title}</h1>
      {video ? (
        <div className="video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video}?rel=0&playsinline=1`}
            title={lesson.title}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : null}
      {metrics.length > 0 ? (
        <div className="metrics">
          {metrics.map((m) => (
            <div key={m.label}>
              <span className="big-number" style={{ fontSize: "3rem" }}>{m.value}</span>
              <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{m.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {lesson.body ? <p className="player-body">{lesson.body}</p> : null}
    </>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}:${String(s).padStart(2, "0")}`;
}
