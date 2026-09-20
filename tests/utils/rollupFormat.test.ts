import { describe, expect, it } from "vitest";
import {
  channelLabel,
  formatCompactCount,
  formatCount,
  formatCountDelta,
  formatCurrency,
  formatNewToday,
  formatPctDelta,
  growthDeltaTone,
} from "../../app/utils/rollupFormat";
import type { RollupDelta } from "../../shared/types/dashboard";

describe("formatCurrency", () => {
  it("formats a whole-dollar USD amount with no decimals", () => {
    expect(formatCurrency(1284)).toBe("$1,284");
  });
});

describe("formatCompactCount", () => {
  it("compacts a large count with one decimal", () => {
    expect(formatCompactCount(48200)).toBe("48.2K");
  });

  it("leaves a small count as-is", () => {
    expect(formatCompactCount(312)).toBe("312");
  });
});

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(48200)).toBe("48,200");
  });
});

describe("formatPctDelta", () => {
  it("returns null when there is no delta yet", () => {
    expect(formatPctDelta(null)).toBeNull();
  });

  it("returns null when the delta has no pct (zero baseline)", () => {
    const delta: RollupDelta = { value: 40, pct: null };
    expect(formatPctDelta(delta)).toBeNull();
  });

  it("formats a positive delta with an up arrow", () => {
    expect(formatPctDelta({ value: 82, pct: 8.2 })).toBe("▲ 8.2%");
  });

  it("formats a negative delta with a down arrow and a positive magnitude", () => {
    expect(formatPctDelta({ value: -40, pct: -4.5 })).toBe("▼ 4.5%");
  });

  it("formats a zero delta with a flat dash", () => {
    expect(formatPctDelta({ value: 0, pct: 0 })).toBe("— 0.0%");
  });
});

describe("formatCountDelta", () => {
  it("returns null when there is no delta yet", () => {
    expect(formatCountDelta(null)).toBeNull();
  });

  it("formats a positive delta with an up arrow and thousands separators", () => {
    expect(formatCountDelta({ value: 1449, pct: 3.1 })).toBe("▲ 1,449");
  });

  it("formats a negative delta with a down arrow and a positive magnitude", () => {
    expect(formatCountDelta({ value: -14, pct: -4.7 })).toBe("▼ 14");
  });
});

describe("formatNewToday", () => {
  it("returns null when there is no delta yet (e.g. Sentry hasn't synced)", () => {
    expect(formatNewToday(null)).toBeNull();
  });

  it("reports the count of new issues when the delta is positive", () => {
    expect(formatNewToday({ value: 2, pct: 40 })).toBe("2 new today");
  });

  it("reports no new issues when the delta is zero or negative", () => {
    expect(formatNewToday({ value: 0, pct: 0 })).toBe("No new issues today");
    expect(formatNewToday({ value: -3, pct: -20 })).toBe("No new issues today");
  });
});

describe("growthDeltaTone", () => {
  it("is ok for positive growth", () => {
    expect(growthDeltaTone({ value: 10, pct: 5 })).toBe("ok");
  });

  it("is muted for zero, negative, or missing deltas", () => {
    expect(growthDeltaTone({ value: 0, pct: 0 })).toBe("muted");
    expect(growthDeltaTone({ value: -10, pct: -5 })).toBe("muted");
    expect(growthDeltaTone(null)).toBe("muted");
  });
});

describe("channelLabel", () => {
  it("maps known GA4 channel buckets to their display labels", () => {
    expect(channelLabel("organic")).toBe("Organic search");
    expect(channelLabel("direct")).toBe("Direct");
    expect(channelLabel("referral")).toBe("Referral & social");
    expect(channelLabel("other")).toBe("Other");
  });

  it("capitalizes an unknown channel rather than dropping it", () => {
    expect(channelLabel("email")).toBe("Email");
  });
});
