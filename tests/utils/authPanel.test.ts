import { describe, expect, it } from "vitest";
import { buildAuthPanelData } from "../../app/utils/authPanel";
import { appDetailFixture } from "../support/appDetailFixture";
import type { CurrentMetric, MetricPoint } from "../../shared/types/dashboard";

const SYNC = "2026-09-20T12:00:00.000Z";

function metric(
  name: string,
  period: string,
  value: number,
  capturedAt = SYNC,
): CurrentMetric {
  return { metric: name, period, value, capturedAt };
}

function days(counts: number[]): MetricPoint[] {
  return counts.map((value, index) => ({
    capturedAt: `2026-09-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
    value,
  }));
}

const FULL_METRICS: CurrentMetric[] = [
  metric("users", "current", 200),
  metric("new_users", "30d", 12),
  metric("verified_users", "current", 150),
  metric("active_users", "7d", 40),
  metric("active_subscribers", "current", 10),
  metric("auth_method:github", "current", 120),
  metric("auth_method:password", "current", 30),
  metric("auth_method:google", "current", 50),
];

describe("buildAuthPanelData", () => {
  it("returns null when no users metric has synced, instead of an empty or zeroed panel", () => {
    expect(buildAuthPanelData(null)).toBeNull();
    expect(buildAuthPanelData(appDetailFixture())).toBeNull();
  });

  it("maps every live metric into the panel model", () => {
    const data = buildAuthPanelData(
      appDetailFixture({
        metrics: FULL_METRICS,
        series: [
          {
            metric: "signups",
            period: "daily",
            points: days([0, 3, 9, 1]),
          },
        ],
        clerkUsersUrl: "https://dashboard.clerk.com/~/users",
      }),
    );

    expect(data).toMatchObject({
      totalUsers: 200,
      newUsersLabel: "+12 in 30d",
      verifiedEmail: "150",
      activeLast7d: "40",
      convertedToPaid: "5.0%",
      clerkUsersUrl: "https://dashboard.clerk.com/~/users",
    });
    expect(data?.signups).toMatchObject({
      bestDayLabel: "12 SEP",
      bestDayCount: 9,
    });
  });

  it("sorts sign-in methods by share and labels them", () => {
    const data = buildAuthPanelData(
      appDetailFixture({ metrics: FULL_METRICS }),
    );

    expect(
      data?.methods.map(({ label, pctLabel }) => [label, pctLabel]),
    ).toEqual([
      ["GitHub", "60%"],
      ["Google", "25%"],
      ["Password", "15%"],
    ]);
  });

  it("omits what was not derived: no scan metrics, no subscribers, no signup series", () => {
    const data = buildAuthPanelData(
      appDetailFixture({ metrics: [metric("users", "current", 200)] }),
    );

    expect(data).toMatchObject({
      newUsersLabel: null,
      verifiedEmail: null,
      activeLast7d: null,
      convertedToPaid: null,
      signups: null,
      methods: [],
    });
  });

  it("drops scan-derived metrics left over from an older sync than the users total", () => {
    const data = buildAuthPanelData(
      appDetailFixture({
        metrics: [
          metric("users", "current", 9_000),
          metric("verified_users", "current", 150, "2026-08-01T00:00:00.000Z"),
          metric("active_users", "7d", 40, "2026-08-01T00:00:00.000Z"),
          metric(
            "auth_method:github",
            "current",
            150,
            "2026-08-01T00:00:00.000Z",
          ),
        ],
      }),
    );

    expect(data?.verifiedEmail).toBeNull();
    expect(data?.activeLast7d).toBeNull();
    expect(data?.methods).toEqual([]);
  });

  it("omits converted-to-paid when subscribers exceed users (ratio not derivable)", () => {
    const data = buildAuthPanelData(
      appDetailFixture({
        metrics: [
          metric("users", "current", 2),
          metric("active_subscribers", "current", 5),
        ],
      }),
    );

    expect(data?.convertedToPaid).toBeNull();
  });

  it("omits the best-day footer when no signups happened in the window", () => {
    const data = buildAuthPanelData(
      appDetailFixture({
        metrics: [metric("users", "current", 2)],
        series: [{ metric: "signups", period: "daily", points: days([0, 0]) }],
      }),
    );

    expect(data?.signups).toMatchObject({ bestDayLabel: null });
  });

  it.each([
    ["development", "development"],
    ["production", "production"],
  ] as const)("surfaces the clerk source's %s environment", (environment) => {
    const data = buildAuthPanelData(
      appDetailFixture({
        metrics: [metric("users", "current", 2)],
        sources: [
          {
            vendor: "stripe",
            environment: "production",
            ok: true,
            lastRunAt: null,
            lastSuccessAt: null,
            error: null,
          },
          {
            vendor: "clerk",
            environment,
            ok: true,
            lastRunAt: null,
            lastSuccessAt: null,
            error: null,
          },
        ],
      }),
    );

    expect(data?.environment).toBe(environment);
  });
});
