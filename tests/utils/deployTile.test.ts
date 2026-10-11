import { describe, expect, it } from "vitest";
import { buildDeployTileData } from "../../app/utils/deployTile";
import type { AppDeploy } from "../../shared/types/dashboard";

const NOW = new Date("2026-10-10T14:00:00Z");
const APP_URL = "https://basin.fm";

function tile(deploy: AppDeploy) {
  return buildDeployTileData(deploy, APP_URL, NOW);
}

describe("buildDeployTileData", () => {
  it("describes a successful deploy with relative time, full time, and a Netlify link", () => {
    expect(
      tile({
        status: "success",
        deployId: "d1",
        finishedAt: "2026-10-10T12:00:00.000Z",
      }),
    ).toEqual({
      value: "SUCCESS",
      tone: "ok",
      sub: "2h ago",
      fullTime: "10 OCT 2026 · 12:00 UTC",
      finishedAt: "2026-10-10T12:00:00.000Z",
      href: "https://app.netlify.com/projects/basin-fm/deploys/d1",
    });
  });

  it("flags a failed deploy as danger", () => {
    const data = tile({
      status: "failed",
      deployId: "d2",
      finishedAt: "2026-10-04T14:00:00.000Z",
    });
    expect(data).toMatchObject({
      value: "FAILED",
      tone: "danger",
      sub: "6d ago",
    });
  });

  it("shows an in-progress deploy with no time but still linked", () => {
    expect(
      tile({ status: "in_progress", deployId: "d3", finishedAt: null }),
    ).toMatchObject({
      value: "IN PROGRESS",
      tone: "warn",
      sub: "Build running",
      fullTime: null,
      href: "https://app.netlify.com/projects/basin-fm/deploys/d3",
    });
  });

  it("has no tone and no link when no deploy has synced", () => {
    expect(
      tile({ status: "none", deployId: null, finishedAt: null }),
    ).toMatchObject({ value: "NO DEPLOYS", tone: undefined, href: null });
  });

  it("explains how to enable it when not configured", () => {
    expect(
      tile({ status: "not_configured", deployId: null, finishedAt: null }),
    ).toMatchObject({
      value: "NOT CONFIGURED",
      sub: "Set NUXT_NETLIFY_TOKEN to enable",
      href: null,
    });
  });

  it("treats a weekly-old success as normal, not stale", () => {
    expect(
      tile({
        status: "success",
        deployId: "d4",
        finishedAt: "2026-10-03T14:00:00.000Z",
      }),
    ).toMatchObject({ tone: "ok", sub: "7d ago" });
  });
});
