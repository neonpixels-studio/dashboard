import { describe, expect, it } from "vitest";
import { APPS, findAppBySlug } from "../../app/config/apps";

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
});
