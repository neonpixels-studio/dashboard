import { describe, expect, it } from "vitest";
import {
  netlifyDeployUrl,
  netlifyLogsUrl,
  netlifyProjectName,
  netlifySettingsUrl,
} from "../../app/utils/netlify";
import { APPS } from "../../app/config/apps";

describe("netlifyProjectName", () => {
  it.each([
    ["https://basin.fm", "basin-fm"],
    ["https://markpost.io", "markpost-io"],
    ["https://farflung.io", "farflung-io"],
    ["https://danholloran.me", "danholloran-me"],
    ["https://grimicorn.dev", "grimicorn-dev"],
    ["https://neonpixels.dev", "neonpixels-dev"],
  ])("maps %s to %s", (url, expected) => {
    expect(netlifyProjectName(url)).toBe(expected);
  });

  it("replaces every dot, not just the first", () => {
    expect(netlifyProjectName("https://a.b.example.com/path")).toBe(
      "a-b-example-com",
    );
  });

  it("covers every configured property", () => {
    for (const app of APPS) {
      expect(netlifyProjectName(app.url)).toBe(
        new URL(app.url).hostname.replaceAll(".", "-"),
      );
    }
  });
});

describe("netlify urls", () => {
  it("builds the settings url", () => {
    expect(netlifySettingsUrl("https://basin.fm")).toBe(
      "https://app.netlify.com/projects/basin-fm/configuration/general",
    );
  });

  it("builds the logs url", () => {
    expect(netlifyLogsUrl("https://basin.fm")).toBe(
      "https://app.netlify.com/projects/basin-fm/analytics-and-metrics/observability",
    );
  });

  it("builds the deploy url from the shared project-name mapping", () => {
    expect(netlifyDeployUrl("https://basin.fm", "abc123")).toBe(
      "https://app.netlify.com/projects/basin-fm/deploys/abc123",
    );
  });
});
