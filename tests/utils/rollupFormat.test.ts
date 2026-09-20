import { describe, expect, it } from "vitest";
import {
  channelLabel,
  countGrowthDeltaTone,
  formatCompactCount,
  formatCount,
  formatCountDelta,
  formatCurrency,
  formatIssuesSinceYesterday,
  formatOrDash,
  formatPct,
  formatPctDelta,
  formatSyncedDate,
  NO_VALUE_LABEL,
  pctGrowthDeltaTone,
} from "../../app/utils/rollupFormat";
import type { RollupDelta } from "../../shared/types/dashboard";

describe("formatCurrency", () => {
  it("formats a whole-dollar USD amount with no decimals", () => {
    expect(formatCurrency(1284)).toBe("$1,284");
  });
});

describe("formatOrDash", () => {
  it("returns the dash placeholder for null", () => {
    expect(formatOrDash(null, formatCurrency)).toBe(NO_VALUE_LABEL);
  });

  it("returns the dash placeholder for undefined", () => {
    expect(formatOrDash(undefined, formatCurrency)).toBe(NO_VALUE_LABEL);
  });

  it("formats a real value (including zero) with the given formatter", () => {
    expect(formatOrDash(1284, formatCurrency)).toBe("$1,284");
    expect(formatOrDash(0, formatCount)).toBe("0");
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

describe("formatPct", () => {
  it("appends a percent sign to a whole number", () => {
    expect(formatPct(44)).toBe("44%");
  });

  it("rounds a fractional share — trafficChannelSplitAcrossApps can return one", () => {
    expect(formatPct(33.33)).toBe("33%");
    expect(formatPct(33.5)).toBe("34%");
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

  it("shows a flat dash (not an up arrow) when a tiny positive change rounds to 0.0%", () => {
    // 0.3 out of a large baseline is a real, positive raw delta, but it
    // rounds to a displayed "0.0%" — the arrow must agree with what's
    // printed, not the unrounded number underneath it.
    expect(formatPctDelta({ value: 0.3, pct: 0.04 })).toBe("— 0.0%");
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

describe("formatIssuesSinceYesterday", () => {
  it("returns null when there is no delta yet (e.g. Sentry hasn't synced)", () => {
    expect(formatIssuesSinceYesterday(null)).toBeNull();
  });

  it("reports a net increase with a plus sign, not an arrow", () => {
    expect(formatIssuesSinceYesterday({ value: 2, pct: 40 })).toBe(
      "+2 since yesterday",
    );
  });

  it("reports a net decrease with a minus sign", () => {
    expect(formatIssuesSinceYesterday({ value: -3, pct: -20 })).toBe(
      "−3 since yesterday",
    );
  });

  it("reports no change when opens and closes cancel out", () => {
    expect(formatIssuesSinceYesterday({ value: 0, pct: 0 })).toBe(
      "No change since yesterday",
    );
  });
});

describe("pctGrowthDeltaTone", () => {
  it("is ok for positive growth", () => {
    expect(pctGrowthDeltaTone({ value: 10, pct: 5 })).toBe("ok");
  });

  it("is muted for zero, negative, or missing deltas", () => {
    expect(pctGrowthDeltaTone({ value: 0, pct: 0 })).toBe("muted");
    expect(pctGrowthDeltaTone({ value: -10, pct: -5 })).toBe("muted");
    expect(pctGrowthDeltaTone(null)).toBe("muted");
  });

  it("agrees with formatPctDelta's rounding: muted when a tiny positive change rounds to 0.0%", () => {
    expect(pctGrowthDeltaTone({ value: 0.3, pct: 0.04 })).toBe("muted");
  });

  it("is muted when pct is null (zero baseline) — formatPctDelta hides the delta entirely then, so the tone is never actually rendered", () => {
    expect(pctGrowthDeltaTone({ value: 5, pct: null })).toBe("muted");
  });
});

describe("countGrowthDeltaTone", () => {
  it("is ok for positive growth", () => {
    expect(countGrowthDeltaTone({ value: 10, pct: 5 })).toBe("ok");
  });

  it("is muted for zero, negative, or missing deltas", () => {
    expect(countGrowthDeltaTone({ value: 0, pct: 0 })).toBe("muted");
    expect(countGrowthDeltaTone({ value: -10, pct: -5 })).toBe("muted");
    expect(countGrowthDeltaTone(null)).toBe("muted");
  });

  it("agrees with formatCountDelta's rounding, not pct — ok here even though pct alone would round to 0.0%", () => {
    expect(countGrowthDeltaTone({ value: 1, pct: 0.01 })).toBe("ok");
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

describe("formatSyncedDate", () => {
  it("formats an ISO timestamp as DD MON YYYY", () => {
    expect(formatSyncedDate("2026-09-19T11:56:00.000Z")).toBe("19 SEP 2026");
  });

  it("always uses a 3-letter month abbreviation, for every month", () => {
    expect(formatSyncedDate("2026-01-05T00:00:00.000Z")).toBe("05 JAN 2026");
    expect(formatSyncedDate("2026-12-25T00:00:00.000Z")).toBe("25 DEC 2026");
  });

  it("returns null for an unparseable timestamp rather than NaN/undefined text", () => {
    expect(formatSyncedDate("not-a-real-timestamp")).toBeNull();
  });
});
