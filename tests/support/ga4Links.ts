import { expect } from "vitest";
import type { VueWrapper } from "@vue/test-utils";

export const GA4_REPORTS_URL_FIXTURE =
  "https://analytics.google.com/analytics/web/#/p412345678/reports/intelligenthome";

export function expectGa4Links(wrapper: VueWrapper, expectedCount: number) {
  const links = wrapper.findAll("a.ga4-view-link");
  expect(links).toHaveLength(expectedCount);
  for (const link of links) {
    expect(link.attributes("href")).toBe(GA4_REPORTS_URL_FIXTURE);
    expect(link.attributes("target")).toBe("_blank");
  }
}
