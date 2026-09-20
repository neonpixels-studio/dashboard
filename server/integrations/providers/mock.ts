import type { IntegrationProvider, ProviderResult } from "../types";

// Reference implementation of the IntegrationProvider seam: no network call,
// no DB access, no real vendor. It exists so the orchestrator (and this
// package's own tests) has something conforming to the contract to run
// against, and so a new vendor provider has a minimal file to copy from.
const EMPTY_RESULT: ProviderResult = {
  metrics: [],
  trafficBreakdown: [],
  syndicationPosts: [],
};

export const mockProvider: IntegrationProvider = {
  vendor: "mock",
  async fetch(): Promise<ProviderResult> {
    return EMPTY_RESULT;
  },
};
