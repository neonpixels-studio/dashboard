import type { OverviewAlertsResponse } from "#shared/types/alerts";

// Wraps `GET /api/overview/alerts` for the "/" Alerts panel.
export function useOverviewAlerts() {
  const { data, pending, error, refresh } = useFetch<OverviewAlertsResponse>(
    "/api/overview/alerts",
    { key: "overview-alerts" },
  );
  return { data, pending, error, refresh };
}
