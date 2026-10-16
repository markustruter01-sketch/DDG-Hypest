import { Link } from "react-router-dom";
import { getListLibraryQueryKey, useListLibrary } from "@workspace/api-client-react";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

/** Programs the user has bought. Tap one to train. */
export function LibraryPage() {
  const library = useListLibrary({ query: { queryKey: getListLibraryQueryKey(), retry: false }, request });
  const items = Array.isArray(library.data) ? library.data : null;

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Library</h1>
      {library.isError && errorStatus(library.error) === 401 ? (
        <Link className="primary-button" to="/login">Log in</Link>
      ) : null}
      {library.isError && errorStatus(library.error) !== 401 ? (
        <p className="error-text" role="alert">{serverErrorText(library.error)}</p>
      ) : null}
      {items && items.length === 0 ? (
        <Link className="tile tile-empty" to="/explore">
          <span className="tile-title">Find a program</span>
          <span className="label">Explore →</span>
        </Link>
      ) : null}
      {items && items.length > 0 ? (
        <div className="tile-grid">
          {items.map((p) => (
            <Link key={p.id} className="tile" to={`/train/${p.id}`}>
              <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{p.creator_display_name}</span>
              <span>
                <span className="tile-title" style={{ display: "block" }}>{p.title}</span>
                <span className="tile-meta">{p.lesson_count} {p.lesson_count === 1 ? "lesson" : "lessons"} · Train →</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </main>
  );
}
