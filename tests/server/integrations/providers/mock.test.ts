import { describe, expect, it } from "vitest";
import { mockProvider } from "../../../../server/integrations/providers/mock";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";

describe("mockProvider", () => {
  it("identifies itself as the mock vendor", () => {
    expect(mockProvider.vendor).toBe("mock");
  });

  it("returns a normalized, empty ProviderResult without touching the network or a DB", async () => {
    const config = createTestIntegrationConfig({ vendor: "mock" });

    const result = await mockProvider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
  });

  it("returns a fresh result object on every call, not a shared mutable singleton", async () => {
    const config = createTestIntegrationConfig();

    const first = await mockProvider.fetch(config);
    const second = await mockProvider.fetch(config);

    expect(first).not.toBe(second);
    expect(first.metrics).not.toBe(second.metrics);
  });

  it("returns the same normalized shape regardless of the config passed in", async () => {
    const configWithSecret = createTestIntegrationConfig({
      externalId: "external-123",
      secret: "shh",
    });

    const result = await mockProvider.fetch(configWithSecret);

    expect(Object.keys(result).sort()).toEqual(
      ["metrics", "syndicationPosts", "trafficBreakdown"].sort(),
    );
  });

  // Demonstrates the fixture/test-helper seam described in the issue: a real
  // vendor provider would assert its fetch() output against a fixture
  // recorded from a real API response, never a live call.
  it("has a recorded fixture available for network-free testing", async () => {
    const fixture = await loadFixture<{
      metrics: unknown[];
      trafficBreakdown: unknown[];
      syndicationPosts: unknown[];
    }>("mock", "empty");

    expect(fixture.metrics).toEqual([]);
    expect(fixture.trafficBreakdown).toEqual([]);
    expect(fixture.syndicationPosts).toEqual([]);
  });
});
