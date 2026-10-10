import { describe, expect, it } from "vitest";
import { buildHeaderLinks } from "../../app/utils/headerLinks";
import { APPS } from "../../app/config/apps";

describe("buildHeaderLinks", () => {
  it.each([
    ["basin", "basin-fm"],
    ["markpost", "markpost-io"],
    ["farflung", "farflung-io"],
    ["danholloran", "danholloran-me"],
    ["grimicorn", "grimicorn-dev"],
    ["neonpixels", "neonpixels-dev"],
  ])(
    "gives %s Logs and Settings pointing at Netlify project %s",
    (slug, project) => {
      const app = APPS.find((candidate) => candidate.slug === slug);
      expect(app).toBeDefined();
      const links = buildHeaderLinks(app!);
      expect(links.find((link) => link.label === "Logs")?.href).toBe(
        `https://app.netlify.com/projects/${project}/analytics-and-metrics/observability`,
      );
      expect(links.find((link) => link.label === "Settings")?.href).toBe(
        `https://app.netlify.com/projects/${project}/configuration/general`,
      );
    },
  );

  it("adds Posts only for the writing template", () => {
    for (const app of APPS) {
      const posts = buildHeaderLinks(app).find(
        (link) => link.label === "Posts",
      );
      expect(Boolean(posts)).toBe(app.template === "writing");
    }
    const writing = APPS.find((app) => app.template === "writing");
    expect(writing).toBeDefined();
    expect(writing!.url).toBe("https://danholloran.me");
    expect(
      buildHeaderLinks(writing!).find((link) => link.label === "Posts")?.href,
    ).toBe("https://danholloran.me/posts/");
  });

  it("never emits a placeholder href", () => {
    for (const app of APPS) {
      for (const link of buildHeaderLinks(app)) {
        expect(link.href).not.toBe("#");
      }
    }
  });
});
