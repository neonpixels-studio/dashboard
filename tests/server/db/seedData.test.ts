import { describe, expect, it } from "vitest";
import { APPS } from "../../../app/config/apps";
import { buildIntegrationConfigSeed } from "../../../server/db/seedData";

const PRODUCT_VENDORS = ["stripe", "clerk", "sentry"] as const;
const WRITING_VENDORS = ["medium", "hashnode", "devto"] as const;

describe("buildIntegrationConfigSeed", () => {
  it("matches the current 6 apps declared in apps.ts", () => {
    expect(APPS).toHaveLength(6);
  });

  it("gives every app an enabled GA4 row", () => {
    const rows = buildIntegrationConfigSeed(APPS);
    for (const app of APPS) {
      expect(rows).toContainEqual({
        slug: app.slug,
        vendor: "ga4",
        enabled: true,
      });
    }
  });

  it("adds stripe/clerk/sentry only for product-template apps", () => {
    const rows = buildIntegrationConfigSeed(APPS);
    const productSlugs = APPS.filter((app) => app.template === "product").map(
      (app) => app.slug,
    );
    const nonProductSlugs = APPS.filter(
      (app) => app.template !== "product",
    ).map((app) => app.slug);

    for (const slug of productSlugs) {
      for (const vendor of PRODUCT_VENDORS) {
        expect(rows).toContainEqual({ slug, vendor, enabled: true });
      }
    }
    for (const slug of nonProductSlugs) {
      for (const vendor of PRODUCT_VENDORS) {
        expect(rows).not.toContainEqual({ slug, vendor, enabled: true });
      }
    }
  });

  it("adds medium/hashnode/devto only for writing-template apps", () => {
    const rows = buildIntegrationConfigSeed(APPS);
    const writingSlugs = APPS.filter((app) => app.template === "writing").map(
      (app) => app.slug,
    );
    const nonWritingSlugs = APPS.filter(
      (app) => app.template !== "writing",
    ).map((app) => app.slug);

    for (const slug of writingSlugs) {
      for (const vendor of WRITING_VENDORS) {
        expect(rows).toContainEqual({ slug, vendor, enabled: true });
      }
    }
    for (const slug of nonWritingSlugs) {
      for (const vendor of WRITING_VENDORS) {
        expect(rows).not.toContainEqual({ slug, vendor, enabled: true });
      }
    }
  });

  it("gives marketing-template apps only the GA4 row", () => {
    const rows = buildIntegrationConfigSeed(APPS);
    const marketingSlugs = APPS.filter(
      (app) => app.template === "marketing",
    ).map((app) => app.slug);

    for (const slug of marketingSlugs) {
      const vendorsForSlug = rows
        .filter((row) => row.slug === slug)
        .map((row) => row.vendor);
      expect(vendorsForSlug).toEqual(["ga4"]);
    }
  });

  it("produces exactly one row per (slug, vendor) pair", () => {
    const rows = buildIntegrationConfigSeed(APPS);
    const pairIds = rows.map((row) => `${row.slug}:${row.vendor}`);
    expect(new Set(pairIds).size).toBe(pairIds.length);
  });
});
