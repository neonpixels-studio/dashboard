// The "component boundary" seam described in issue #11: merges the static
// identity config (`app/config/apps.ts`) with the fetched, DB-backed metrics
// (`shared/types/dashboard.ts`, served by `GET /api/apps` / `GET /api/apps/
// [slug]`) into single view models. Widgets read through `card`/`detail`
// rather than through top-level fields for anything metric-shaped, so it's
// never ambiguous whether a value is real or a rendering guess — `null` means
// "not loaded yet" and must be rendered as a loading/error state, never a
// zero. The wiring issues (#18/#19/#20) decide *how* each widget renders a
// populated `card`/`detail`; this module only builds the merged shape.

import type { DashboardApp } from "~/config/apps";
import type { AppCard, AppDetailResponse } from "#shared/types/dashboard";

export interface AppCardViewModel extends DashboardApp {
  card: AppCard | null;
}

// `AppCard.metrics` is generic — "every metric found for the app, not a
// fixed list" per its doc comment in shared/types/dashboard.ts — but
// PropertyCard's stats row is a fixed-height, non-wrapping flex row. Both
// PropertyCard.vue and its PropertyCardMetricsSkeleton.vue counterpart cap
// their rendered stat count at this shared constant so the loading state
// and the loaded state always reserve/use the same amount of space. Issue
// #19 owns curating *which* metrics fill these slots.
export const PROPERTY_CARD_STAT_COUNT = 3;

export interface AppDetailViewModel extends DashboardApp {
  detail: AppDetailResponse | null;
}

export function toAppCardViewModel(
  config: DashboardApp,
  card: AppCard | null,
): AppCardViewModel {
  return { ...config, card };
}

export function toAppDetailViewModel(
  config: DashboardApp,
  detail: AppDetailResponse | null,
): AppDetailViewModel {
  return { ...config, detail };
}

// The exact prop contract every AppDetail* template (issue #20) takes from
// app/pages/apps/[slug].vue — a shared type so each template's own
// `defineProps<...>()` is a one-line reference instead of three near-
// identical multi-line literals (fallow's duplication gate flagged the
// repeated literal).
export interface AppDetailTemplateProps {
  app: AppDetailViewModel;
  pending: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}
