import type { IntegrationProvider, ProviderResult } from "../types";

// Reference implementation of the IntegrationProvider seam: no network call,
// no DB access, no real vendor. It exists so the orchestrator (and this
// package's own tests) has something conforming to the contract to run
// against, and so a new vendor provider has a minimal file to copy from.
//
// Builds a fresh result object on every call rather than returning a shared
// module-level constant — a real provider's result flows into orchestrator
// code that may reasonably mutate it (e.g. stamping `slug` onto each row
// before insert), and a shared singleton would let one caller's mutation
// leak into every other caller and every later sync run.
export const mockProvider: IntegrationProvider = {
  vendor: "mock",
  async fetch(): Promise<ProviderResult> {
    return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
  },
};
