import { describe, expect, it } from "vitest";
import {
  checksUrl,
  openIssuesUrl,
  openPullsUrl,
} from "../../../../server/integrations/github/links";
import { reposForProperty } from "../../../../server/integrations/github/repos";
import { APPS } from "../../../../app/config/apps";

describe("reposForProperty", () => {
  it("maps markpost to markpost and markpost-cli", () => {
    expect(reposForProperty("markpost")).toEqual(["markpost", "markpost-cli"]);
  });

  it("defaults every other property to the repo named after its slug", () => {
    const others = APPS.filter((app) => app.slug !== "markpost");
    expect(others.length).toBeGreaterThan(0);
    for (const app of others) {
      expect(reposForProperty(app.slug)).toEqual([app.slug]);
    }
  });
});

describe("github links", () => {
  it("links a single repo to its own issues and pulls pages", () => {
    expect(openIssuesUrl(["basin"])).toBe(
      "https://github.com/neonpixels-studio/basin/issues",
    );
    expect(openPullsUrl(["basin"])).toBe(
      "https://github.com/neonpixels-studio/basin/pulls",
    );
  });

  it("links several repos to one search spanning all of them", () => {
    const query = (url: string) =>
      new URL(url).searchParams.get("q")!.split(" ");

    const issues = openIssuesUrl(["markpost", "markpost-cli"]);
    const pulls = openPullsUrl(["markpost", "markpost-cli"]);

    expect(issues.startsWith("https://github.com/issues?q=")).toBe(true);
    expect(query(issues)).toEqual([
      "is:open",
      "is:issue",
      "repo:neonpixels-studio/markpost",
      "repo:neonpixels-studio/markpost-cli",
    ]);
    expect(pulls.startsWith("https://github.com/pulls?q=")).toBe(true);
    expect(query(pulls)).toContain("is:pr");
  });

  it("links CI to the commit's checks, or the Actions page without a commit", () => {
    expect(checksUrl("basin", "abc")).toBe(
      "https://github.com/neonpixels-studio/basin/commit/abc/checks",
    );
    expect(checksUrl("basin", null)).toBe(
      "https://github.com/neonpixels-studio/basin/actions",
    );
  });
});
