import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetConfigQueryKey,
  getGetLibraryProgramQueryKey,
  getGetPublishedProgramQueryKey,
  getListLibraryQueryKey,
  useGetConfig,
  useGetLibraryProgram,
  useGetPublishedProgram,
  useTestPurchase,
} from "@workspace/api-client-react";
import { formatUsd } from "@/lib/money";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

/** Program page: what you get, and a buy bar. Lesson content is never on this page. */
export function ExploreDetailPage() {
  const params = useParams();
  const programId = Number(params.programId);
  const valid = Number.isInteger(programId) && programId > 0;
  const id = valid ? programId : 0;
  const program = useGetPublishedProgram(id, {
    query: { queryKey: getGetPublishedProgramQueryKey(id), enabled: valid, retry: false },
  });
  const access = useGetLibraryProgram(id, {
    query: { queryKey: getGetLibraryProgramQueryKey(id), enabled: valid, retry: false },
    request,
  });
  const detail = program.data && "price_cents" in program.data ? program.data : null;

  if (!valid || (program.isError && errorStatus(program.error) === 404)) {
    return (
      <main className="screen-scroll">
        <Link className="text-link" to="/explore">← Explore</Link>
        <p className="error-text">Program not found</p>
      </main>
    );
  }

  return (
    <main className="screen-scroll" style={{ paddingTop: 0, paddingBottom: "calc(var(--nav-height) + 6rem)" }}>
      <header className="program-hero">
        <Link className="text-link" to="/explore" style={{ color: "var(--color-on-dark)" }}>← Explore</Link>
        {detail ? (
          <>
            <h1 className="hero-title" style={{ margin: "auto 0 var(--space-2)", fontSize: "2.75rem" }}>{detail.title}</h1>
            {detail.creator_handle ? (
              <Link className="text-link" to={`/@${detail.creator_handle}`} style={{ color: "var(--color-on-dark)" }}>
                {detail.creator_display_name}
              </Link>
            ) : (
              <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{detail.creator_display_name}</span>
            )}
          </>
        ) : null}
      </header>

      {program.isError ? <p className="error-text" role="alert">{serverErrorText(program.error)}</p> : null}

      {detail ? (
        <>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="card stat"><span className="big-number">{detail.lesson_count}</span><span className="label">{detail.lesson_count === 1 ? "Lesson" : "Lessons"}</span></div>
            <div className="card stat"><span className="big-number">{formatUsd(detail.price_cents).replace(".00", "")}</span><span className="label">Price</span></div>
          </div>
          {detail.description ? <p className="screen-copy" style={{ whiteSpace: "pre-line" }}>{detail.description}</p> : null}
          <BuyBar programId={detail.id} priceCents={detail.price_cents} owned={access.isSuccess} loggedOut={access.isError && errorStatus(access.error) === 401} />
        </>
      ) : null}
    </main>
  );
}

function BuyBar({ programId, priceCents, owned, loggedOut }: { programId: number; priceCents: number; owned: boolean; loggedOut: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useGetConfig({ query: { queryKey: getGetConfigQueryKey(), staleTime: Infinity } });
  const buy = useTestPurchase({ request });

  async function onTestBuy() {
    try {
      await buy.mutateAsync({ id: programId });
    } catch (err) {
      if (errorStatus(err) !== 409) {
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: getGetLibraryProgramQueryKey(programId) });
    await queryClient.invalidateQueries({ queryKey: getListLibraryQueryKey() });
    navigate(`/train/${programId}`);
  }

  let action;
  if (owned) {
    action = <Link className="primary-button" to={`/train/${programId}`}>Start training →</Link>;
  } else if (loggedOut) {
    action = <Link className="primary-button" to="/signup">Sign up to buy</Link>;
  } else if (config.data?.dev_tools) {
    action = (
      <button className="primary-button" type="button" onClick={onTestBuy} disabled={buy.isPending}>
        Test buy · no charge
      </button>
    );
  } else {
    action = <button className="primary-button" type="button" disabled>Buy · coming soon</button>;
  }

  return (
    <div className="buy-bar">
      <span className="big-number" style={{ fontSize: "2rem" }}>{formatUsd(priceCents)}</span>
      {action}
      {buy.isError && errorStatus(buy.error) !== 409 ? <p className="error-text" role="alert">{serverErrorText(buy.error)}</p> : null}
    </div>
  );
}
