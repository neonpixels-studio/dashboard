import { describe, expect, it } from "vitest";
import type { AppTemplate, DashboardApp } from "../../../app/config/apps";
import { APPS } from "../../../app/config/apps";
import { buildIntegrationConfigSeed } from "../../../server/db/seedData";

const PRODUCT_VENDORS = ["stripe", "clerk", "sentry"];
const WRITING_VENDORS = ["medium", "hashnode", "devto"];

function vendorsForSlug(
  rows: ReturnType<typeof buildIntegrationConfigSeed>,
  slug: string,
): string[] {
  return rows.filter((row) => row.slug === slug).map((row) => row.vendor);
}

// A fully-typed fixture app, independent of the live `apps.ts` content, so
// the core mapping logic is pinned regardless of how many real apps exist
// per template — and so a future required field on `DashboardApp` fails this
// test file to update, rather than being cast away.
function buildFixtureApp(slug: string, template: AppTemplate): DashboardApp {
  return {
    name: `${slug}.test`,
    url: `https://${slug}.test`,
    slug,
    nameBase: slug,
    nameTld: ".test",
    accent: "#000000",
    order: "00",
    category: "TEST",
    statusLabel: "LIVE",
    statusColor: "#000000",
    description: "Fixture app for seed data tests.",
    tagline: "Fixture app for seed data tests.",
    template,
    stats: [],
    sparklinePath: "M0 0",
    integrations: [],
  };
}

const FIXTURE_APPS: DashboardApp[] = [
  buildFixtureApp("fixture-product", "product"),
  buildFixtureApp("fixture-writing", "writing"),
  buildFixtureApp("fixture-marketing", "marketing"),
];

describe("buildIntegrationConfigSeed", () => {
  it("seeds every row as disabled — no secret is configured yet", () => {
    const rows = buildIntegrationConfigSeed(FIXTURE_APPS);
    expect(rows.every((row) => row.enabled === false)).toBe(true);
  });

  it("gives a product app GA4 plus stripe/clerk/sentry, nothing else", () => {
    const rows = buildIntegrationConfigSeed(FIXTURE_APPS);
    expect(vendorsForSlug(rows, "fixture-product").sort()).toEqual(
      ["ga4", ...PRODUCT_VENDORS].sort(),
    );
  });

  it("gives a writing app GA4 plus medium/hashnode/devto, nothing else", () => {
    const rows = buildIntegrationConfigSeed(FIXTURE_APPS);
    expect(vendorsForSlug(rows, "fixture-writing").sort()).toEqual(
      ["ga4", ...WRITING_VENDORS].sort(),
    );
  });

  it("gives a marketing app only GA4", () => {
    const rows = buildIntegrationConfigSeed(FIXTURE_APPS);
    expect(vendorsForSlug(rows, "fixture-marketing")).toEqual(["ga4"]);
  });

  // Grounds the fixture-based assertions above in the real console config,
  // per the issue's acceptance criteria — asserted on vendor membership and
  // pair-uniqueness rather than exact row counts, so adding another app of
  // an existing template doesn't make this brittle.
  describe("against the real apps.ts config", () => {
    it("gives every current app a GA4 row", () => {
      const rows = buildIntegrationConfigSeed(APPS);
      for (const app of APPS) {
        expect(vendorsForSlug(rows, app.slug)).toContain("ga4");
      }
    });

    it("gives every product-template app stripe/clerk/sentry", () => {
      const rows = buildIntegrationConfigSeed(APPS);
      const productApps = APPS.filter((app) => app.template === "product");
      expect(productApps.length).toBeGreaterThan(0);
      for (const app of productApps) {
        const vendors = vendorsForSlug(rows, app.slug);
        for (const vendor of PRODUCT_VENDORS) {
          expect(vendors).toContain(vendor);
        }
      }
    });

    it("gives every writing-template app medium/hashnode/devto", () => {
      const rows = buildIntegrationConfigSeed(APPS);
      const writingApps = APPS.filter((app) => app.template === "writing");
      expect(writingApps.length).toBeGreaterThan(0);
      for (const app of writingApps) {
        const vendors = vendorsForSlug(rows, app.slug);
        for (const vendor of WRITING_VENDORS) {
          expect(vendors).toContain(vendor);
        }
      }
    });

    it("gives every marketing-template app only GA4", () => {
      const rows = buildIntegrationConfigSeed(APPS);
      const marketingApps = APPS.filter((app) => app.template === "marketing");
      expect(marketingApps.length).toBeGreaterThan(0);
      for (const app of marketingApps) {
        expect(vendorsForSlug(rows, app.slug)).toEqual(["ga4"]);
      }
    });

    it("produces exactly one row per (slug, vendor) pair", () => {
      const rows = buildIntegrationConfigSeed(APPS);
      const pairIds = rows.map((row) => `${row.slug}:${row.vendor}`);
      expect(new Set(pairIds).size).toBe(pairIds.length);
    });
  });
});
