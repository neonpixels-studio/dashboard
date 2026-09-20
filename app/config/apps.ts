// One record per property drives everything that repeats across the console:
// dashboard cards, property counts, login pills, and the /apps/[slug] detail
// pages. Adding or editing a property is a data change here, never a markup
// copy. All metric values are static mock data until real integrations land.

export type AppTemplate = "product" | "writing" | "marketing";

export type StatTone = "ok" | "warn" | "danger";

export interface AppStat {
  label: string;
  value: string;
  tone?: StatTone;
}

export type IntegrationTone = "default" | "warn" | "danger" | "planned";

export interface AppIntegration {
  label: string;
  tone?: IntegrationTone;
}

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
  statusLabel: string;
  statusColor: string;
  description: string;
  tagline: string;
  template: AppTemplate;
  // The studio site renders the brand mark instead of an accent bar and is
  // excluded from the login page property pills.
  isStudioSite?: boolean;
  stats: AppStat[];
  sparklinePath: string;
  integrations: AppIntegration[];
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
    statusLabel: "LIVE",
    statusColor: "#FFB020",
    description: "RSS, podcasts, YouTube and Bluesky in one stream.",
    tagline: "Everything you consume, in one stream · production",
    template: "product",
    stats: [
      { label: "MRR", value: "$412" },
      { label: "USERS", value: "1,204" },
      { label: "ISSUES", value: "3", tone: "warn" },
    ],
    sparklinePath:
      "M0 29 C0.7 28.9 2.7 28.8 4.1 28.3 C5.5 27.9 6.9 26.9 8.3 26.3 C9.7 25.7 11 25 12.4 24.7 C13.8 24.4 15.2 25 16.6 24.7 C18 24.4 19.3 23.2 20.7 22.7 C22.1 22.2 23.4 21.8 24.8 21.6 C26.2 21.4 27.6 21.3 29 21.5 C30.4 21.7 31.7 22.8 33.1 22.8 C34.5 22.8 35.8 21.4 37.2 21.3 C38.6 21.2 40 22.3 41.4 22.1 C42.8 22 44.1 20.8 45.5 20.4 C46.9 20 48.3 20.1 49.7 19.7 C51.1 19.3 52.4 18.7 53.8 18.2 C55.2 17.7 56.5 17.5 57.9 16.9 C59.3 16.3 60.7 14.8 62.1 14.6 C63.5 14.3 64.8 15.3 66.2 15.4 C67.6 15.5 68.9 15.4 70.3 15.4 C71.7 15.4 73.1 15.6 74.5 15.7 C75.9 15.8 77.2 16 78.6 15.9 C80 15.8 81.4 15 82.8 14.9 C84.2 14.8 85.5 15.4 86.9 15.4 C88.3 15.4 89.6 15.2 91 15.1 C92.4 15 93.8 14.8 95.2 14.7 C96.6 14.6 97.9 14.9 99.3 14.7 C100.7 14.5 102 14.1 103.4 13.7 C104.8 13.3 106.2 12.7 107.6 12 C109 11.3 110.3 10.4 111.7 9.7 C113.1 9 114.5 8.4 115.9 7.6 C117.3 6.8 119.3 5.4 120 5",
    integrations: [
      { label: "GA" },
      { label: "CLERK" },
      { label: "STRIPE" },
      { label: "SENTRY" },
    ],
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
    statusLabel: "1 FATAL",
    statusColor: "#FF6B6B",
    description: "Webhook or email in, Markdown file on your filesystem out.",
    tagline: "Webhook or email in, Markdown out · production",
    template: "product",
    stats: [
      { label: "MRR", value: "$591" },
      { label: "USERS", value: "1,877" },
      { label: "ISSUES", value: "1", tone: "danger" },
    ],
    sparklinePath:
      "M0 27 C0.7 27.3 2.7 29.1 4.1 29 C5.5 28.9 6.9 26.6 8.3 26.1 C9.7 25.6 11 25.6 12.4 25.9 C13.8 26.1 15.2 27.8 16.6 27.6 C18 27.4 19.3 25.4 20.7 24.7 C22.1 24 23.4 23.5 24.8 23.6 C26.2 23.7 27.6 24.9 29 25.3 C30.4 25.7 31.7 26.4 33.1 26.2 C34.5 26 35.8 24.6 37.2 24.2 C38.6 23.8 40 24.2 41.4 23.7 C42.8 23.2 44.1 21.6 45.5 21.3 C46.9 21.1 48.3 22.7 49.7 22.2 C51.1 21.7 52.4 19.1 53.8 18.4 C55.2 17.7 56.5 18.3 57.9 18.2 C59.3 18.1 60.7 18.3 62.1 18 C63.5 17.7 64.8 16.8 66.2 16.2 C67.6 15.6 68.9 14.5 70.3 14.5 C71.7 14.5 73.1 16 74.5 16.1 C75.9 16.2 77.2 15.5 78.6 15 C80 14.5 81.4 13.3 82.8 13 C84.2 12.8 85.5 13.3 86.9 13.5 C88.3 13.8 89.6 14.6 91 14.5 C92.4 14.4 93.8 13 95.2 12.8 C96.6 12.6 97.9 13.5 99.3 13.2 C100.7 12.9 102 11.5 103.4 11.1 C104.8 10.7 106.2 10.7 107.6 10.8 C109 10.9 110.3 11.9 111.7 11.5 C113.1 11.1 114.5 9.4 115.9 8.3 C117.3 7.2 119.3 5.5 120 5",
    integrations: [
      { label: "GA" },
      { label: "CLERK" },
      { label: "STRIPE" },
      { label: "SENTRY 1", tone: "danger" },
    ],
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
    statusLabel: "LIVE",
    statusColor: "#22D3EE",
    description:
      "A travel blog and tracker in one. Log it, plot it, write about it.",
    tagline: "A travel blog and tracker in one · production",
    template: "product",
    stats: [
      { label: "MRR", value: "$281" },
      { label: "USERS", value: "843" },
      { label: "ISSUES", value: "2", tone: "warn" },
    ],
    sparklinePath:
      "M0 24.8 C0.7 25.1 2.7 26.4 4.1 26.3 C5.5 26.2 6.9 24.8 8.3 24.3 C9.7 23.8 11 24.1 12.4 23.1 C13.8 22.2 15.2 20.4 16.6 18.6 C18 16.8 19.3 12.8 20.7 12.3 C22.1 11.8 23.4 15.8 24.8 15.6 C26.2 15.4 27.6 11.2 29 11.1 C30.4 11 31.7 15.8 33.1 15.2 C34.5 14.6 35.8 8.2 37.2 7.5 C38.6 6.8 40 10.6 41.4 11.1 C42.8 11.6 44.1 9.5 45.5 10.4 C46.9 11.3 48.3 16.6 49.7 16.7 C51.1 16.8 52.4 11.5 53.8 11.1 C55.2 10.7 56.5 13.2 57.9 14.3 C59.3 15.5 60.7 16.8 62.1 18 C63.5 19.2 64.8 21.7 66.2 21.7 C67.6 21.7 68.9 18.1 70.3 18.1 C71.7 18.1 73.1 19.8 74.5 21.5 C75.9 23.2 77.2 27.3 78.6 28.5 C80 29.8 81.4 29 82.8 29 C84.2 29 85.5 29.5 86.9 28.4 C88.3 27.3 89.6 24.5 91 22.2 C92.4 19.9 93.8 16.6 95.2 14.6 C96.6 12.6 97.9 10.8 99.3 10.1 C100.7 9.4 102 11.3 103.4 10.5 C104.8 9.7 106.2 5.4 107.6 5 C109 4.6 110.3 6.7 111.7 8.3 C113.1 9.9 114.5 13.1 115.9 14.5 C117.3 15.9 119.3 16.2 120 16.5",
    integrations: [
      { label: "GA" },
      { label: "CLERK" },
      { label: "STRIPE" },
      { label: "SENTRY" },
    ],
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
    statusLabel: "LIVE",
    statusColor: "#A78BFA",
    description:
      "Landscape photography, travel and dev writing. Cross-posted four ways.",
    tagline: "Landscape photography, travel and dev writing · Nuxt on Netlify",
    template: "writing",
    stats: [
      { label: "SESSIONS", value: "12.4K" },
      { label: "POSTS", value: "3" },
      { label: "SYNC FAIL", value: "1", tone: "warn" },
    ],
    sparklinePath:
      "M0 25.1 C0.7 25.4 2.7 26.3 4.1 26.9 C5.5 27.5 6.9 29 8.3 29 C9.7 29 11 26.8 12.4 26.8 C13.8 26.8 15.2 28.9 16.6 28.9 C18 28.9 19.3 27.3 20.7 26.7 C22.1 26.1 23.4 25 24.8 25.1 C26.2 25.2 27.6 26.7 29 27.2 C30.4 27.7 31.7 27.8 33.1 28 C34.5 28.2 35.8 28.7 37.2 28.3 C38.6 27.9 40 26.7 41.4 25.8 C42.8 24.9 44.1 23.8 45.5 22.8 C46.9 21.9 48.3 20.5 49.7 20.1 C51.1 19.7 52.4 19.9 53.8 20.2 C55.2 20.5 56.5 22.2 57.9 22 C59.3 21.8 60.7 19.4 62.1 18.9 C63.5 18.3 64.8 19.1 66.2 18.7 C67.6 18.3 68.9 17.2 70.3 16.6 C71.7 16 73.1 15.3 74.5 15.3 C75.9 15.3 77.2 17.1 78.6 16.8 C80 16.6 81.4 14.9 82.8 13.8 C84.2 12.8 85.5 10.8 86.9 10.5 C88.3 10.2 89.6 11.5 91 11.7 C92.4 11.8 93.8 11.7 95.2 11.4 C96.6 11.1 97.9 10.8 99.3 10 C100.7 9.2 102 7.5 103.4 6.8 C104.8 6.1 106.2 6.1 107.6 5.9 C109 5.8 110.3 6.1 111.7 5.9 C113.1 5.8 114.5 5 115.9 5 C117.3 5 119.3 5.6 120 5.7",
    integrations: [
      { label: "GA" },
      { label: "MEDIUM" },
      { label: "HASHNODE" },
      { label: "DEV" },
      { label: "ZYVOP", tone: "warn" },
    ],
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
    statusLabel: "LIVE",
    statusColor: "#B4F03C",
    description:
      "The chaotic coding sidekick behind everything else on this page.",
    tagline:
      "The agent workflow that ships the rest of the studio · production",
    template: "marketing",
    stats: [
      { label: "SESSIONS", value: "11.9K" },
      { label: "RUNS/WK", value: "412" },
    ],
    sparklinePath:
      "M0 23.1 C0.7 22.3 2.7 19.6 4.1 18.1 C5.5 16.6 6.9 14.2 8.3 14.2 C9.7 14.2 11 17.6 12.4 17.9 C13.8 18.2 15.2 15.8 16.6 15.9 C18 16 19.3 17.2 20.7 18.5 C22.1 19.8 23.4 22.4 24.8 23.9 C26.2 25.4 27.6 26.4 29 27.3 C30.4 28.2 31.7 29.4 33.1 29 C34.5 28.6 35.8 25.1 37.2 24.6 C38.6 24.1 40 26.2 41.4 25.9 C42.8 25.6 44.1 23.6 45.5 22.9 C46.9 22.1 48.3 22.3 49.7 21.4 C51.1 20.5 52.4 17.7 53.8 17.3 C55.2 16.9 56.5 18.9 57.9 19 C59.3 19.1 60.7 18.9 62.1 17.9 C63.5 16.9 64.8 14.5 66.2 13 C67.6 11.5 68.9 9.6 70.3 8.7 C71.7 7.8 73.1 7 74.5 7.7 C75.9 8.4 77.2 12.9 78.6 13.2 C80 13.5 81.4 10.4 82.8 9.7 C84.2 8.9 85.5 9.5 86.9 8.7 C88.3 7.9 89.6 5 91 5 C92.4 5 93.8 8.5 95.2 8.6 C96.6 8.7 97.9 5.7 99.3 5.4 C100.7 5.1 102 6.8 103.4 7 C104.8 7.2 106.2 5.9 107.6 6.7 C109 7.5 110.3 11 111.7 11.6 C113.1 12.2 114.5 10.4 115.9 10.3 C117.3 10.2 119.3 11 120 11.1",
    integrations: [{ label: "GA" }],
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
    statusLabel: "STUDIO SITE",
    statusColor: "#F2F2F5",
    description:
      "The front door. Its own numbers — the tiles above are every property combined.",
    tagline: "The studio front door · one page, six outbound links",
    template: "marketing",
    isStudioSite: true,
    stats: [
      { label: "SESSIONS", value: "6.1K" },
      { label: "OUTBOUND", value: "1,475" },
    ],
    sparklinePath:
      "M0 5 C0.7 5.6 2.7 7.4 4.1 8.5 C5.5 9.6 6.9 11.4 8.3 11.7 C9.7 12 11 10.9 12.4 10.3 C13.8 9.7 15.2 8.2 16.6 8.2 C18 8.2 19.3 9.4 20.7 10.2 C22.1 11 23.4 12 24.8 12.8 C26.2 13.7 27.6 14.9 29 15.3 C30.4 15.7 31.7 15.5 33.1 15.3 C34.5 15.1 35.8 14.7 37.2 13.9 C38.6 13.1 40 10.5 41.4 10.6 C42.8 10.7 44.1 13.8 45.5 14.6 C46.9 15.4 48.3 15 49.7 15.3 C51.1 15.6 52.4 15.8 53.8 16.6 C55.2 17.4 56.5 19 57.9 19.9 C59.3 20.8 60.7 22.3 62.1 22.2 C63.5 22.1 64.8 19.1 66.2 19.1 C67.6 19.1 68.9 21.4 70.3 22.3 C71.7 23.2 73.1 24.6 74.5 24.7 C75.9 24.8 77.2 23 78.6 23.2 C80 23.4 81.4 25.5 82.8 26.1 C84.2 26.7 85.5 27.5 86.9 27 C88.3 26.5 89.6 23 91 23 C92.4 23 93.8 25.8 95.2 26.8 C96.6 27.8 97.9 28.9 99.3 29 C100.7 29.1 102 27.9 103.4 27.2 C104.8 26.5 106.2 24.9 107.6 24.8 C109 24.7 110.3 26.2 111.7 26.6 C113.1 27.1 114.5 27.9 115.9 27.5 C117.3 27.1 119.3 24.8 120 24.2",
    integrations: [{ label: "GA" }],
  },
];

export function findAppBySlug(slug: string): DashboardApp | undefined {
  return APPS.find((app) => app.slug === slug);
}
