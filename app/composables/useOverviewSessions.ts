import type { OverviewSessionsResponse } from "#shared/types/overviewSessions";

// Wraps `GET /api/overview/sessions` for the "/" sessions-by-property chart.
export function useOverviewSessions() {
  const { data, pending, error, refresh } = useFetch<OverviewSessionsResponse>(
    "/api/overview/sessions",
    { key: "overview-sessions" },
  );
  return { data, pending, error, refresh };
}
