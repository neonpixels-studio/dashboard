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
