// One record per property drives everything that repeats across the console:
// dashboard cards, property counts, login pills, and the /apps/[slug] detail
// pages. Adding or editing a property is a data change here, never a markup
// copy.
//
// Identity/presentation only — no metric values live here. Those come from
// the read API (`shared/types/dashboard.ts`) via the `useOverview`/`useApps`/
// `useApp` composables and are merged with this static config at the
// component boundary (see `app/utils/appViewModel.ts`), never hardcoded.

export type AppTemplate = "product" | "writing" | "marketing";

export interface DashboardApp {
  name: string;
  url: string;
  slug: string;
  // Split so the TLD can render in the property accent color.
  nameBase: string;
  nameTld: string;
  accent: string;
  order: string;
  category: string;
  description: string;
  tagline: string;
  template: AppTemplate;
  // The studio site renders the brand mark instead of an accent bar and is
  // excluded from the login page property pills.
  isStudioSite?: boolean;
}

export const APPS: DashboardApp[] = [
  {
    name: "basin.fm",
    url: "https://basin.fm",
    slug: "basin",
    nameBase: "basin",
    nameTld: ".fm",
    accent: "#FFB020",
    order: "01",
    category: "SYNDICATION",
    description: "RSS, podcasts, YouTube and Bluesky in one stream.",
    tagline: "Everything you consume, in one stream · production",
    template: "product",
  },
  {
    name: "markpost.io",
    url: "https://markpost.io",
    slug: "markpost",
    nameBase: "markpost",
    nameTld: ".io",
    accent: "#FF3EA5",
    order: "02",
    category: "CAPTURE",
    description: "Webhook or email in, Markdown file on your filesystem out.",
    tagline: "Webhook or email in, Markdown out · production",
    template: "product",
  },
  {
    name: "wanderist.io",
    url: "https://wanderist.io",
    slug: "wanderist",
    nameBase: "wanderist",
    nameTld: ".io",
    accent: "#22D3EE",
    order: "03",
    category: "TRAVEL",
    description:
      "A travel blog and tracker in one. Log it, plot it, write about it.",
    tagline: "A travel blog and tracker in one · production",
    template: "product",
  },
  {
    name: "danholloran.me",
    url: "https://danholloran.me",
    slug: "danholloran",
    nameBase: "danholloran",
    nameTld: ".me",
    accent: "#A78BFA",
    order: "04",
    category: "WRITING",
    description:
      "Landscape photography, travel and dev writing. Cross-posted four ways.",
    tagline: "Landscape photography, travel and dev writing · Nuxt on Netlify",
    template: "writing",
  },
  {
    name: "grimicorn.dev",
    url: "https://grimicorn.dev",
    slug: "grimicorn",
    nameBase: "grimicorn",
    nameTld: ".dev",
    accent: "#B4F03C",
    order: "05",
    category: "AGENT WORKFLOW",
    description:
      "The chaotic coding sidekick behind everything else on this page.",
    tagline:
      "The agent workflow that ships the rest of the studio · production",
    template: "marketing",
  },
  {
    name: "neonpixels.dev",
    url: "https://neonpixels.dev",
    slug: "neonpixels",
    nameBase: "neonpixels",
    nameTld: ".dev",
    accent: "#82828F",
    order: "06",
    category: "MARKETING",
    description:
      "The front door. Its own numbers — the tiles above are every property combined.",
    tagline: "The studio front door · one page, six outbound links",
    template: "marketing",
    isStudioSite: true,
  },
];

export function findAppBySlug(slug: string): DashboardApp | undefined {
  return APPS.find((app) => app.slug === slug);
}

// Sorts a list of per-app rollup rows (e.g. OverviewMetric.byApp) into the
// same order APPS declares them in, rather than whatever order the DB
// returned — the rollup tiles' StatList rows should read top-to-bottom the
// same way the property grid below them does. An app slug with no matching
// config (shouldn't happen; every row is sourced from APPS' own slugs on the
// server) sorts last rather than throwing.
export function sortByAppOrder<Item extends { slug: string }>(
  items: Item[],
): Item[] {
  const indexBySlug = new Map(APPS.map((app, index) => [app.slug, index]));
  return [...items].sort(
    (a, b) =>
      (indexBySlug.get(a.slug) ?? APPS.length) -
      (indexBySlug.get(b.slug) ?? APPS.length),
  );
}
