import type { LocationQuery } from "vue-router";
import {
  APPS,
  INTERNAL_APPS,
  sortByAppOrder,
  type DashboardApp,
} from "~/config/apps";

export interface SwitcherItem {
  slug: string;
  name: string;
  accent: string;
  current: boolean;
  to: { path: string; query: LocationQuery; hash: string };
}

export interface SwitcherLocation {
  query: LocationQuery;
  hash: string;
}

type SwitcherSource = Pick<DashboardApp, "slug" | "name" | "accent">;

const INTERNAL_SLUGS = new Set(INTERNAL_APPS.map((app) => app.slug));

// Every property with a detail page, in grid order, each linking to its own
// detail page with the current query and hash carried over (so `#traffic` and
// the range query survive a switch). Internal apps have no detail page.
export function buildSwitcherItems(
  currentSlug: string,
  location: SwitcherLocation,
  sources: SwitcherSource[] = APPS,
): SwitcherItem[] {
  const properties = sources.filter((app) => !INTERNAL_SLUGS.has(app.slug));
  return sortByAppOrder(properties).map((app) => ({
    slug: app.slug,
    name: app.name,
    accent: app.accent,
    current: app.slug === currentSlug,
    to: {
      path: `/apps/${app.slug}`,
      query: { ...location.query },
      hash: location.hash,
    },
  }));
}
