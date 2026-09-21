import { describe, expect, it } from "vitest";
import { assertValidDate } from "../../../../server/integrations/syndication/dates";

describe("assertValidDate", () => {
  it("returns the date unchanged when it's valid", () => {
    const date = new Date("2026-09-01T12:00:00Z");

    expect(assertValidDate(date, () => "unused")).toBe(date);
  });

  it("throws the describeError() message for an Invalid Date", () => {
    expect(() =>
      assertValidDate(new Date("not-a-date"), () => "custom error message"),
    ).toThrow("custom error message");
  });
});
