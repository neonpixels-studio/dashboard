import { describe, expect, it } from "vitest";
import {
  toAppCardViewModel,
  toAppDetailViewModel,
} from "../../app/utils/appViewModel";
import { findAppBySlug } from "../../app/config/apps";
import type { AppCard, AppDetailResponse } from "../../shared/types/dashboard";

const config = findAppBySlug("basin")!;

const card: AppCard = {
  slug: "basin",
  status: { label: "LIVE", tone: "ok" },
  metrics: [
    {
      metric: "mrr",
      period: "current",
      value: 412,
      capturedAt: "2026-09-20T00:00:00.000Z",
    },
  ],
  sparklines: [],
  integrations: [],
};

const detail: AppDetailResponse = {
  slug: "basin",
  metrics: [],
  series: [],
  trafficBreakdown: [],
  syndication: [],
  alerts: [],
  sources: [],
  lastSyncedAt: null,
};

describe("toAppCardViewModel", () => {
  it("carries every identity field from config through unchanged", () => {
    const viewModel = toAppCardViewModel(config, null);
    expect(viewModel).toMatchObject(config);
  });

  it("nests a null card when metrics haven't loaded yet", () => {
    expect(toAppCardViewModel(config, null).card).toBeNull();
  });

  it("nests the fetched card when metrics are available", () => {
    expect(toAppCardViewModel(config, card).card).toBe(card);
  });
});

describe("toAppDetailViewModel", () => {
  it("carries every identity field from config through unchanged", () => {
    const viewModel = toAppDetailViewModel(config, null);
    expect(viewModel).toMatchObject(config);
  });

  it("nests a null detail when it hasn't loaded yet", () => {
    expect(toAppDetailViewModel(config, null).detail).toBeNull();
  });

  it("nests the fetched detail when available", () => {
    expect(toAppDetailViewModel(config, detail).detail).toBe(detail);
  });
});
