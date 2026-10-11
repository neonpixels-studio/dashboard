import { describe, expect, it } from "vitest";
import {
  buildStripePanelData,
  mrrWindowPoints,
} from "../../app/utils/stripePanel";
import { appDetailFixture } from "../support/appDetailFixture";
import type {
  MetricSeries,
  StripeDetail,
  StripeRecentEvent,
} from "../../shared/types/dashboard";

function mrrSeries(points: Array<[string, number]>): MetricSeries {
  return {
    metric: "mrr",
    period: "current",
    points: points.map(([capturedAt, value]) => ({ capturedAt, value })),
  };
}

function stripeDetail(overrides: Partial<StripeDetail> = {}): StripeDetail {
  return {
    environment: "production",
    dashboardUrl: "https://dashboard.stripe.com/products",
    plans: [],
    events: [],
    ...overrides,
  };
}

function recentEvent(
  overrides: Partial<StripeRecentEvent> = {},
): StripeRecentEvent {
  return {
    id: "evt_1",
    kind: "new",
    occurredAt: "2026-09-19T10:00:00.000Z",
    email: "m••••a@hey.com",
    plan: "Pro",
    amount: 4,
    url: "https://dashboard.stripe.com/subscriptions/sub_1",
    ...overrides,
  };
}

describe("mrrWindowPoints", () => {
  it("keeps only the 30 days ending at the newest point", () => {
    const points = mrrWindowPoints([
      mrrSeries([
        ["2026-07-01T00:00:00.000Z", 100],
        ["2026-08-25T00:00:00.000Z", 200],
        ["2026-09-24T00:00:00.000Z", 300],
      ]),
    ]);

    expect(points.map((point) => point.value)).toEqual([200, 300]);
  });

  it("returns nothing for fewer than two points rather than a flat made-up line", () => {
    expect(
      mrrWindowPoints([mrrSeries([["2026-09-24T00:00:00.000Z", 300]])]),
    ).toEqual([]);
    expect(mrrWindowPoints([])).toEqual([]);
  });
});

describe("buildStripePanelData", () => {
  it("is empty when nothing has synced, with no path, plans, or events", () => {
    const data = buildStripePanelData(appDetailFixture());

    expect(data).toMatchObject({
      isEmpty: true,
      mrrPath: "",
      plans: [],
      events: [],
      environment: null,
      dashboardUrl: null,
    });
  });

  it("draws the MRR line and axis from the real series", () => {
    const data = buildStripePanelData(
      appDetailFixture({
        series: [
          mrrSeries([
            ["2026-09-01T00:00:00.000Z", 100],
            ["2026-09-10T00:00:00.000Z", 150],
            ["2026-09-19T00:00:00.000Z", 200],
          ]),
        ],
      }),
    );

    expect(data.isEmpty).toBe(false);
    expect(data.mrrPath.startsWith("M0")).toBe(true);
    expect(data.mrrAxisLabels).toEqual(["01 SEP", "10 SEP", "19 SEP"]);
  });

  it("computes each plan's share of total revenue", () => {
    const data = buildStripePanelData(
      appDetailFixture({
        stripe: stripeDetail({
          plans: [
            {
              productId: "p1",
              plan: "Pro",
              monthlyRevenue: 300,
              subscribers: 3,
            },
            {
              productId: "p2",
              plan: "Supporter",
              monthlyRevenue: 100,
              subscribers: 5,
            },
          ],
        }),
      }),
    );

    expect(data.plans).toEqual([
      { key: "p1", label: "Pro", value: "$300", pctLabel: "75%", pct: 75 },
      {
        key: "p2",
        label: "Supporter",
        value: "$100",
        pctLabel: "25%",
        pct: 25,
      },
    ]);
  });

  it("shows no plan bars when plan revenue sums to zero", () => {
    const data = buildStripePanelData(
      appDetailFixture({
        stripe: stripeDetail({
          plans: [
            {
              productId: "p1",
              plan: "Free",
              monthlyRevenue: 0,
              subscribers: 2,
            },
          ],
        }),
      }),
    );

    expect(data.plans).toEqual([]);
  });

  it("formats each event kind: signed amount, label, muted/failed flags, and link", () => {
    const data = buildStripePanelData(
      appDetailFixture({
        stripe: stripeDetail({
          environment: "development",
          events: [
            recentEvent(),
            recentEvent({
              id: "evt_2",
              kind: "canceled",
              email: "j••••n@fastmail.com",
            }),
            recentEvent({
              id: "evt_3",
              kind: "payment_failed",
              email: null,
              amount: null,
              url: null,
            }),
          ],
        }),
      }),
    );

    expect(data.environment).toBe("development");
    expect(data.events).toEqual([
      {
        key: "evt_1",
        date: "19 SEP",
        email: "m••••a@hey.com",
        plan: "Pro",
        amount: "+$4.00",
        failed: false,
        muted: false,
        url: "https://dashboard.stripe.com/subscriptions/sub_1",
        linkLabel: "New: m••••a@hey.com, view in Stripe",
      },
      expect.objectContaining({
        plan: "Canceled · Pro",
        amount: "−$4.00",
        failed: false,
        muted: true,
      }),
      expect.objectContaining({
        email: "Unknown customer",
        plan: "Payment failed · Pro",
        amount: "—",
        failed: true,
        muted: true,
        url: null,
      }),
    ]);
  });
});
