import { describe, expect, it } from "vitest";
import {
  createProviderRegistry,
  integrationRegistry,
} from "../../../server/integrations";
import { mockProvider } from "../../../server/integrations/providers/mock";
import { stripeProvider } from "../../../server/integrations/stripe";
import { clerkProvider } from "../../../server/integrations/clerk";

describe("integrationRegistry", () => {
  it("has the reference mock provider registered out of the box", () => {
    expect(integrationRegistry.get("mock")).toBe(mockProvider);
  });

  it("has the stripe provider registered out of the box", () => {
    expect(integrationRegistry.get("stripe")).toBe(stripeProvider);
  });

  it("has the clerk provider registered out of the box", () => {
    expect(integrationRegistry.get("clerk")).toBe(clerkProvider);
  });

  it("returns undefined for a vendor with no registered provider", () => {
    expect(integrationRegistry.get("not-a-real-vendor")).toBeUndefined();
  });
});

describe("createProviderRegistry (re-exported from the barrel)", () => {
  it("builds an independent, scoped registry from any subset of providers", () => {
    const scopedRegistry = createProviderRegistry([mockProvider]);

    expect(scopedRegistry.get("mock")).toBe(mockProvider);
    expect(scopedRegistry.list()).toEqual([mockProvider]);
  });
});
