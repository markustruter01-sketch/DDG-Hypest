import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { getListPublishedProgramsQueryKey, useListPublishedPrograms } from "@workspace/api-client-react";
import { formatUsd } from "@/lib/money";
import { serverErrorText } from "@/lib/server-error";

export function ExplorePage() {
  const programs = useListPublishedPrograms(undefined, {
    query: { queryKey: getListPublishedProgramsQueryKey(), retry: false },
  });
  const [query, setQuery] = useState("");
  const published = Array.isArray(programs.data) ? programs.data : null;
  const q = query.trim().toLowerCase();
  const shown = published?.filter((p) => q === "" || `${p.title} ${p.creator_display_name}`.toLowerCase().includes(q)) ?? null;

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Explore</h1>
      <label className="search">
        <Search size={18} aria-hidden="true" />
        <input className="text-input" type="search" placeholder="Programs or creators" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search programs" />
      </label>
      {programs.isError ? <p className="error-text" role="alert">{serverErrorText(programs.error)}</p> : null}
      {shown && shown.length === 0 ? <p className="screen-copy">{q ? "No matches" : "No programs yet"}</p> : null}
      {shown && shown.length > 0 ? (
        <div className="tile-grid">
          {shown.map((p) => (
            <Link key={p.id} className="tile" to={`/explore/${p.id}`}>
              <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{p.creator_display_name}</span>
              <span>
                <span className="tile-title" style={{ display: "block" }}>{p.title}</span>
                <span className="tile-meta">
                  {formatUsd(p.price_cents)} · {p.lesson_count} {p.lesson_count === 1 ? "lesson" : "lessons"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </main>
  );
}
