import { describe, expect, it } from "vitest";
import {
  createProviderRegistry,
  DuplicateProviderError,
} from "../../../server/integrations/registry";
import type { IntegrationProvider } from "../../../server/integrations/types";

function stubProvider(vendor: string): IntegrationProvider {
  return {
    vendor,
    fetch: async () => ({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    }),
  };
}

describe("createProviderRegistry", () => {
  it("looks up a registered provider by vendor", () => {
    const provider = stubProvider("ga4");
    const registry = createProviderRegistry([provider]);

    expect(registry.get("ga4")).toBe(provider);
  });

  it("returns undefined for an unregistered vendor", () => {
    const registry = createProviderRegistry([stubProvider("ga4")]);

    expect(registry.get("stripe")).toBeUndefined();
  });

  it("lists every registered provider", () => {
    const ga4 = stubProvider("ga4");
    const stripe = stubProvider("stripe");
    const registry = createProviderRegistry([ga4, stripe]);

    expect(registry.list()).toEqual([ga4, stripe]);
  });

  it("builds an empty registry from an empty list", () => {
    const registry = createProviderRegistry([]);

    expect(registry.list()).toEqual([]);
    expect(registry.get("ga4")).toBeUndefined();
  });

  it("throws DuplicateProviderError when two providers claim the same vendor", () => {
    const first = stubProvider("ga4");
    const second = stubProvider("ga4");

    expect(() => createProviderRegistry([first, second])).toThrow(
      DuplicateProviderError,
    );
  });

  it("keeps each registry instance independent", () => {
    const registryA = createProviderRegistry([stubProvider("ga4")]);
    const registryB = createProviderRegistry([stubProvider("stripe")]);

    expect(registryA.get("stripe")).toBeUndefined();
    expect(registryB.get("ga4")).toBeUndefined();
  });
});
