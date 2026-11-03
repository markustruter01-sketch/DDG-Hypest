import { getGetConfigQueryKey, useGetConfig } from "@workspace/api-client-react";

/** App settings from the API (dev tools flag, prices, screening). Fetched once per session. */
export function useAppConfig() {
  return useGetConfig({ query: { queryKey: getGetConfigQueryKey(), staleTime: Infinity } }).data ?? null;
}
