import { describe, expect, it } from "vitest";
import {
  APPS,
  INTERNAL_APPS,
  findAppBySlug,
  findRollupSourceBySlug,
  sortByAppOrder,
} from "../../app/config/apps";

const VALID_TEMPLATES = ["product", "writing", "marketing"];

describe("apps config", () => {
  it("has unique slugs", () => {
    const slugs = APPS.map((app) => app.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses https URLs matching each app's display name", () => {
    for (const app of APPS) {
      expect(app.url).toBe(`https://${app.name}`);
    }
  });

  it("splits every display name into base + TLD", () => {
    for (const app of APPS) {
      expect(app.nameBase + app.nameTld).toBe(app.name);
    }
  });

  it("assigns a known template to every app", () => {
    for (const app of APPS) {
      expect(VALID_TEMPLATES).toContain(app.template);
    }
  });

  it("gives every app an accent hex color", () => {
    for (const app of APPS) {
      expect(app.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("finds apps by slug and returns undefined for unknown slugs", () => {
    expect(findAppBySlug("basin")?.name).toBe("basin.fm");
    expect(findAppBySlug("nope")).toBeUndefined();
  });

  it("never reuses a property slug for an internal app", () => {
    const propertySlugs = new Set(APPS.map((app) => app.slug));
    for (const internalApp of INTERNAL_APPS) {
      expect(propertySlugs.has(internalApp.slug)).toBe(false);
    }
  });

  it("doesn't resolve an internal app as a property", () => {
    expect(findAppBySlug("dashboard")).toBeUndefined();
  });
});

describe("findRollupSourceBySlug", () => {
  it("resolves a property's name and accent", () => {
    expect(findRollupSourceBySlug("basin")).toMatchObject({
      name: "basin.fm",
      accent: "#FFB020",
    });
  });

  it("resolves an internal app that isn't a property", () => {
    expect(findRollupSourceBySlug("dashboard")?.name).toBe("dashboard");
  });

  it("returns undefined for an unknown slug", () => {
    expect(findRollupSourceBySlug("nope")).toBeUndefined();
  });
});

describe("sortByAppOrder", () => {
  it("reorders rows to match APPS' declared order, regardless of input order", () => {
    const rows = [
      { slug: "farflung", value: 75 },
      { slug: "basin", value: 96 },
      { slug: "markpost", value: 141 },
    ];

    expect(sortByAppOrder(rows).map((row) => row.slug)).toEqual([
      "basin",
      "markpost",
      "farflung",
    ]);
  });

  it("doesn't mutate the input array", () => {
    const rows = [
      { slug: "markpost", value: 1 },
      { slug: "basin", value: 2 },
    ];
    const original = [...rows];

    sortByAppOrder(rows);

    expect(rows).toEqual(original);
  });

  it("sorts an internal app after every property", () => {
    const rows = [
      { slug: "dashboard", value: 1 },
      { slug: "farflung", value: 2 },
      { slug: "basin", value: 3 },
    ];

    expect(sortByAppOrder(rows).map((row) => row.slug)).toEqual([
      "basin",
      "farflung",
      "dashboard",
    ]);
  });

  it("sorts an unknown slug last rather than throwing", () => {
    const rows = [
      { slug: "unknown-app", value: 1 },
      { slug: "basin", value: 2 },
    ];

    expect(sortByAppOrder(rows).map((row) => row.slug)).toEqual([
      "basin",
      "unknown-app",
    ]);
  });
});
