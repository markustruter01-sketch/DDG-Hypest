import { Link, useParams } from "react-router-dom";
import { getGetPublishedProgramQueryKey, useGetPublishedProgram } from "@workspace/api-client-react";
import { formatUsd } from "@/lib/money";
import { serverErrorText } from "@/lib/server-error";

export function ExploreDetailPage() {
  const params = useParams();
  const programId = Number(params.programId);
  const valid = Number.isInteger(programId) && programId > 0;
  const program = useGetPublishedProgram(valid ? programId : 0, {
    query: {
      queryKey: getGetPublishedProgramQueryKey(valid ? programId : 0),
      enabled: valid,
      retry: false,
    },
  });
  const detail =
    program.data && typeof program.data === "object" && "price_cents" in program.data
      ? program.data
      : null;

  return (
    <main className="screen-scroll">
      <Link className="text-link" to="/explore">
        Explore
      </Link>
      {!valid ? <p className="error-text">not found</p> : null}
      {valid && program.isPending ? <p className="screen-copy">Loading</p> : null}
      {valid && program.isError ? (
        <p className="error-text" role="alert">
          {serverErrorText(program.error)}
        </p>
      ) : null}
      {valid && program.isFetched && !program.isError && !detail ? (
        <p className="error-text" role="alert">
          Request failed
        </p>
      ) : null}
      {detail ? (
        <article className="profile-details">
          <h1 className="screen-title">{detail.title}</h1>
          <p className="screen-copy">{detail.creator_display_name}</p>
          <p className="program-price">{formatUsd(detail.price_cents)}</p>
          <p className="screen-copy">{detail.description ?? ""}</p>
          <p className="screen-copy">{detail.lesson_count} lessons</p>
          <button className="primary-button" type="button" disabled>
            Buy — coming soon
          </button>
        </article>
      ) : null}
    </main>
  );
}
