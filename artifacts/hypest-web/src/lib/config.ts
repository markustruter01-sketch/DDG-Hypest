import { getGetConfigQueryKey, useGetConfig } from "@workspace/api-client-react";

/** App settings from the API (dev tools flag, fee rates). Fetched once per session. */
export function useAppConfig() {
  return useGetConfig({ query: { queryKey: getGetConfigQueryKey(), staleTime: Infinity } }).data ?? null;
}

/** What the creator keeps from a sale before card fees, for a fee in basis points. */
export function keepCents(priceCents: number, feeBps: number): number {
  return priceCents - Math.round((priceCents * feeBps) / 10000);
}
