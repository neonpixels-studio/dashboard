import { describe, expect, it } from "vitest";
import { integrationRegistry } from "../../../server/integrations";
import { mockProvider } from "../../../server/integrations/providers/mock";

describe("integrationRegistry", () => {
  it("has the reference mock provider registered out of the box", () => {
    expect(integrationRegistry.get("mock")).toBe(mockProvider);
  });

  it("returns undefined for a vendor with no registered provider", () => {
    expect(integrationRegistry.get("not-a-real-vendor")).toBeUndefined();
  });
});
