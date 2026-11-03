import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey, useGetCurrentUser, useUpdateCurrentUser } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { allTimezones, browserTimezone } from "@/lib/time";

/** Me: which time zone the coach counts days in (streaks, the chat's daily allowance, reminders). */
export function TimezoneSetting() {
  const me = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const update = useUpdateCurrentUser({ request });
  const queryClient = useQueryClient();
  const current = me.data?.timezone ?? null;
  if (!me.data) return null;
  const zones = allTimezones();
  const options = current && !zones.includes(current) ? [current, ...zones] : zones;

  async function pick(timezone: string) {
    if (!timezone || timezone === current) return;
    queryClient.setQueryData(getGetCurrentUserQueryKey(), await update.mutateAsync({ data: { timezone } }));
  }

  return (
    <label className="units-toggle timezone-setting">
      <span className="label">Time zone</span>
      <select className="text-input" value={current ?? ""} onChange={(e) => void pick(e.target.value)} disabled={update.isPending} aria-label="Time zone">
        {current ? null : <option value="">Not set</option>}
        {options.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
      </select>
    </label>
  );
}

/** Members who signed up before time zones were saved: send the phone's zone once, quietly. */
export function SaveTimezoneOnce() {
  const me = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const update = useUpdateCurrentUser({ request });
  const queryClient = useQueryClient();
  const needs = me.data && me.data.timezone === null;
  useEffect(() => {
    const tz = browserTimezone();
    if (!needs || !tz || update.isPending) return;
    update.mutateAsync({ data: { timezone: tz } })
      .then((user) => queryClient.setQueryData(getGetCurrentUserQueryKey(), user))
      .catch(() => undefined); // an unknown zone on an old browser: the member can pick one on Me
  }, [needs]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
