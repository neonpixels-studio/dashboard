import type { MetricPoint, RollupDelta } from "./dashboard";

// One property's entry in GET /api/overview/sessions — the per-app
// historical sessions the "/" overview chart draws. `daily` is the real
// `sessions`/`daily` GA4 series (oldest first, at most the last 30 days);
// `total30d`/`delta` mirror the `sessions`/`30d` rollup the top tile sums
// across apps. `null`/empty mean "not synced yet", never zero.
export interface PropertySessions {
  slug: string;
  daily: MetricPoint[];
  total30d: number | null;
  delta: RollupDelta | null;
}

// Every configured app, in APPS order (apps with no data included, so the
// frontend can tell "no data yet" from "unknown app").
export type OverviewSessionsResponse = PropertySessions[];
