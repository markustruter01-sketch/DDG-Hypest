import { getGetCurrentUserQueryKey, useGetCurrentUser } from "@workspace/api-client-react";
import { LandingPage } from "@/pages/landing-page";
import { TodayPage } from "@/pages/today-page";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

function useMe() {
  return useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request,
  });
}

/** "/" — landing page when logged out; Home dashboard for everyone logged in. */
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
  return me.data ? <TodayPage user={me.data} /> : null;
}
