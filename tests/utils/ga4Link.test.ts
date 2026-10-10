import { describe, expect, it } from "vitest";
import { buildGa4ReportsUrl } from "../../app/utils/ga4Link";

describe("buildGa4ReportsUrl", () => {
  it("builds the GA4 reports URL for a numeric property id", () => {
    expect(buildGa4ReportsUrl("412345678")).toBe(
      "https://analytics.google.com/analytics/web/#/p412345678/reports/intelligenthome",
    );
  });

  it("accepts the Data API's properties/ prefix and surrounding whitespace", () => {
    expect(buildGa4ReportsUrl(" properties/412345678 ")).toBe(
      "https://analytics.google.com/analytics/web/#/p412345678/reports/intelligenthome",
    );
  });

  it.each([null, undefined, "", "   ", "abc", "123/../evil", "12 34", "p123"])(
    "returns null for a missing or non-numeric id (%s)",
    (propertyId) => {
      expect(buildGa4ReportsUrl(propertyId)).toBeNull();
    },
  );
});
