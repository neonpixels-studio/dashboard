import { GA4_REPORTS_URL_FIXTURE } from "../support/ga4Links";
import { describe, expect, it } from "vitest";
import { buildGa4ReportsUrl } from "../../app/utils/ga4Link";

describe("buildGa4ReportsUrl", () => {
  it("builds the GA4 reports URL for a numeric property id", () => {
    expect(buildGa4ReportsUrl("412345678")).toBe(GA4_REPORTS_URL_FIXTURE);
  });

  it("accepts the Data API's properties/ prefix and surrounding whitespace", () => {
    expect(buildGa4ReportsUrl(" properties/412345678 ")).toBe(
      GA4_REPORTS_URL_FIXTURE,
    );
  });

  it.each([null, undefined, "", "   ", "abc", "123/../evil", "12 34", "p123"])(
    "returns null for a missing or non-numeric id (%s)",
    (propertyId) => {
      expect(buildGa4ReportsUrl(propertyId)).toBeNull();
    },
  );
});
