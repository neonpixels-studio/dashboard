import type { AppDetailResponse } from "../../shared/types/dashboard";

// Every AppDetail* test builds its fixture from this shared empty shape
// (mirrors useApp.test.ts's own DETAIL_RESPONSE) so a future field added to
// AppDetailResponse only needs a default here, not in every test file.
export function appDetailFixture(
  overrides: Partial<AppDetailResponse> = {},
): AppDetailResponse {
  return {
    slug: "basin",
    status: { label: "LIVE", tone: "ok" },
    metrics: [],
    series: [],
    trafficBreakdown: [],
    syndication: [],
    alerts: [],
    sources: [],
    integrations: [],
    lastSyncedAt: null,
    clerkUsersUrl: null,
    ga4PropertyId: null,
    database: null,
    ...overrides,
  };
}
