import { Navigate } from "react-router-dom";
import { getGetCurrentUserQueryKey, useGetCurrentUser } from "@workspace/api-client-react";
import { LandingPage } from "@/pages/landing-page";
import { Studio } from "@/pages/studio-page";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

function useMe() {
  return useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request,
  });
}

/** "/" — landing page when logged out; logged-in creators go to their Studio. */
export function HomePage() {
  const me = useMe();
  if (me.isPending) {
    return <main className="screen-scroll" aria-busy="true" />;
  }
  if (me.isError && errorStatus(me.error) === 401) {
    return <LandingPage />;
  }
  if (me.isError) {
    return (
      <main className="screen-scroll">
        <p className="error-text" role="alert">{serverErrorText(me.error)}</p>
      </main>
    );
  }
  return <Navigate to="/studio" replace />;
}

/** "/studio" — creator dashboard; logged-out visitors go to the landing page. */
export function StudioPage() {
  const me = useMe();
  if (me.isPending) {
    return <main className="screen-scroll" aria-busy="true" />;
  }
  if (me.isError && errorStatus(me.error) === 401) {
    return <Navigate to="/" replace />;
  }
  if (me.isError || !me.data) {
    return (
      <main className="screen-scroll">
        <p className="error-text" role="alert">{me.isError ? serverErrorText(me.error) : "Request failed"}</p>
      </main>
    );
  }
  return <Studio user={me.data} />;
}
