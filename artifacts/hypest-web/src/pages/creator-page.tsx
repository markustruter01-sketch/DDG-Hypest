import { useEffect, useRef } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  getGetCreatorQueryKey,
  getListPublishedProgramsQueryKey,
  useGetCreator,
  useListPublishedPrograms,
  useRecordCreatorVisit,
} from "@workspace/api-client-react";
import { Wordmark } from "@/components/wordmark";
import { formatUsd } from "@/lib/money";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

/** Matches "/:slug". Only "@name" is a creator link; anything else goes home. */
export function CreatorRoute() {
  const { slug = "" } = useParams();
  if (!slug.startsWith("@") || slug.length < 2) {
    return <Navigate to="/" replace />;
  }
  return <CreatorPage handle={slug.slice(1).toLowerCase()} />;
}

function CreatorPage({ handle }: { handle: string }) {
  const creator = useGetCreator(handle, {
    query: { queryKey: getGetCreatorQueryKey(handle), retry: false },
    request,
  });
  const programs = useListPublishedPrograms(
    { creator: handle },
    { query: { queryKey: getListPublishedProgramsQueryKey({ creator: handle }), retry: false } },
  );
  const visit = useRecordCreatorVisit({ request });
  const recorded = useRef(false);

  // Arriving here is what makes later sales "creator brought".
  useEffect(() => {
    if (creator.data && !recorded.current) {
      recorded.current = true;
      visit.mutate({ handle });
    }
  }, [creator.data, handle, visit]);

  if (creator.isError) {
    return (
      <main className="screen-scroll">
        <Wordmark tone="dark" />
        <p className="error-text" role="alert">
          {errorStatus(creator.error) === 404 ? "No creator with that link" : serverErrorText(creator.error)}
        </p>
      </main>
    );
  }

  const list = Array.isArray(programs.data) ? programs.data : [];

  return (
    <main className="screen-scroll" style={{ paddingTop: 0 }}>
      <header className="creator-head">
        <Wordmark tone="light" />
        {creator.data ? (
          <>
            <h1 className="hero-title" style={{ margin: "auto 0 0", fontSize: "3rem" }}>{creator.data.display_name}</h1>
            <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>@{creator.data.handle}</span>
          </>
        ) : null}
      </header>
      {creator.data?.bio ? <p className="screen-copy">{creator.data.bio}</p> : null}
      <h2 className="section-title">Programs</h2>
      {programs.isSuccess && list.length === 0 ? <p className="screen-copy">Nothing live yet</p> : null}
      <ul className="program-list">
        {list.map((p) => (
          <li key={p.id}>
            <Link className="program-card" to={`/explore/${p.id}`}>
              <span className="program-card-title">{p.title}</span>
              <span className="screen-copy">{p.lesson_count} {p.lesson_count === 1 ? "lesson" : "lessons"}</span>
              <span className="program-price">{formatUsd(p.price_cents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
