import { Link } from "react-router-dom";
import { getListPublishedProgramsQueryKey, useListPublishedPrograms } from "@workspace/api-client-react";
import { formatUsd } from "@/lib/money";
import { serverErrorText } from "@/lib/server-error";

export function ExplorePage() {
  const programs = useListPublishedPrograms(undefined, {
    query: { queryKey: getListPublishedProgramsQueryKey(), retry: false },
  });

  const published = Array.isArray(programs.data) ? programs.data : null;

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Explore</h1>
      {programs.isPending ? <p className="screen-copy">Loading</p> : null}
      {!programs.isPending && published === null ? (
        <p className="error-text" role="alert">
          {programs.isError ? serverErrorText(programs.error) : "Request failed"}
        </p>
      ) : null}
      {published && published.length === 0 ? <p className="screen-copy">No published programs</p> : null}
      {published && published.length > 0 ? (
        <ul className="program-list">
          {published.map((program) => (
            <li key={program.id}>
              <Link className="program-card" to={`/explore/${program.id}`}>
                <span className="program-card-title">{program.title}</span>
                <span className="screen-copy">{program.creator_display_name}</span>
                <span className="program-price">{formatUsd(program.price_cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
