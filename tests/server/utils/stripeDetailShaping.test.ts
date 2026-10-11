import { afterEach, describe, expect, it, vi } from "vitest";
import {
  stripeAppDashboardUrl,
  stripeDashboardBase,
  stripeDetailForApp,
  stripeObjectUrl,
} from "../../../server/utils/stripeDetailShaping";
import type {
  IntegrationConfigRow,
  StripeEventRow,
  StripePlanRevenueRow,
} from "../../../server/utils/dashboardQueries";

function configRow(
  overrides: Partial<IntegrationConfigRow> = {},
): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "stripe",
    enabled: true,
    externalId: null,
    secretRef: null,
    encryptedSecret: null,
    lastAttemptAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function planRow(
  overrides: Partial<StripePlanRevenueRow> = {},
): StripePlanRevenueRow {
  return {
    id: 1,
    slug: "basin",
    productId: "prod_pro",
    planName: "Pro",
    monthlyRevenue: 312,
    subscribers: 78,
    capturedAt: new Date("2026-09-19T00:00:00Z"),
    ...overrides,
  };
}

function eventRow(overrides: Partial<StripeEventRow> = {}): StripeEventRow {
  return {
    id: 1,
    slug: "basin",
    eventId: "evt_1",
    kind: "new",
    occurredAt: new Date("2026-09-19T10:00:00Z"),
    emailMasked: "m••••a@hey.com",
    planName: "Pro",
    amountCents: 400,
    objectId: "sub_1",
    ...overrides,
  };
}

const LIVE_BASE = "https://dashboard.stripe.com";

describe("stripeDashboardBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the live dashboard for production keys and an unknown environment", () => {
    expect(stripeDashboardBase("basin", "production")).toBe(LIVE_BASE);
    expect(stripeDashboardBase("basin", null)).toBe(LIVE_BASE);
  });

  it("uses the test-mode dashboard for development keys", () => {
    expect(stripeDashboardBase("basin", "development")).toBe(
      `${LIVE_BASE}/test`,
    );
  });

  it("pins the base to the app's own Stripe account", () => {
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_BASIN", "acct_basin");
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_MARKPOST", "acct_markpost");

    expect(stripeDashboardBase("basin", "development")).toBe(
      `${LIVE_BASE}/acct_basin/test`,
    );
    expect(stripeDashboardBase("markpost", "production")).toBe(
      `${LIVE_BASE}/acct_markpost`,
    );
  });

  it("omits the account segment when the app's value is blank", () => {
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_BASIN", "   ");

    expect(stripeDashboardBase("basin", "production")).toBe(LIVE_BASE);
  });
});

describe("stripeObjectUrl", () => {
  it("links subscriptions and invoices under the dashboard base", () => {
    expect(stripeObjectUrl(LIVE_BASE, "sub_1")).toBe(
      `${LIVE_BASE}/subscriptions/sub_1`,
    );
    expect(stripeObjectUrl(LIVE_BASE, "in_1")).toBe(
      `${LIVE_BASE}/invoices/in_1`,
    );
  });

  it("returns null for an object id it doesn't know how to link", () => {
    expect(stripeObjectUrl(LIVE_BASE, "ch_1")).toBeNull();
  });
});

describe("stripeAppDashboardUrl", () => {
  it("links the single product page when the app has one product", () => {
    expect(stripeAppDashboardUrl(LIVE_BASE, ["prod_pro"])).toBe(
      `${LIVE_BASE}/products/prod_pro`,
    );
  });

  it("links the product list when there are several products or none yet", () => {
    expect(stripeAppDashboardUrl(LIVE_BASE, ["a", "b"])).toBe(
      `${LIVE_BASE}/products`,
    );
    expect(stripeAppDashboardUrl(LIVE_BASE, [])).toBe(`${LIVE_BASE}/products`);
  });
});

describe("stripeDetailForApp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null for an app with no enabled Stripe integration", () => {
    expect(
      stripeDetailForApp([planRow()], [eventRow()], [], "basin", null),
    ).toBeNull();
    expect(
      stripeDetailForApp(
        [],
        [],
        [configRow({ enabled: false })],
        "basin",
        null,
      ),
    ).toBeNull();
    expect(
      stripeDetailForApp(
        [],
        [],
        [configRow({ slug: "markpost" })],
        "basin",
        null,
      ),
    ).toBeNull();
  });

  it("is empty-but-present (not null) for a configured app with nothing synced", () => {
    expect(
      stripeDetailForApp(
        [],
        [],
        [configRow({ externalId: "prod_a,prod_b" })],
        "basin",
        "production",
      ),
    ).toEqual({
      environment: "production",
      dashboardUrl: "https://dashboard.stripe.com/products",
      plans: [],
      events: [],
    });
  });

  it("links the configured product even before it has any subscribers, not whichever plans happen to have some", () => {
    const detail = stripeDetailForApp(
      [planRow({ productId: "prod_a" })],
      [],
      [configRow({ externalId: "prod_a, prod_b" })],
      "basin",
      "production",
    );

    expect(detail?.dashboardUrl).toBe("https://dashboard.stripe.com/products");
    expect(
      stripeDetailForApp(
        [],
        [],
        [configRow({ externalId: "prod_solo" })],
        "basin",
        "production",
      )?.dashboardUrl,
    ).toBe("https://dashboard.stripe.com/products/prod_solo");
  });

  it("pins the product and event links to the app's own Stripe account", () => {
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_BASIN", "acct_basin");
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_FARFLUNG", "acct_farflung");

    const detail = stripeDetailForApp(
      [],
      [eventRow()],
      [configRow({ externalId: "prod_pro" })],
      "basin",
      "development",
    );

    expect(detail?.dashboardUrl).toBe(
      "https://dashboard.stripe.com/acct_basin/test/products/prod_pro",
    );
    expect(detail?.events[0]?.url).toBe(
      "https://dashboard.stripe.com/acct_basin/test/subscriptions/sub_1",
    );
  });

  it("shapes plans and events, converting cents to dollars and linking events by environment", () => {
    const detail = stripeDetailForApp(
      [planRow()],
      [
        eventRow(),
        eventRow({
          id: 2,
          eventId: "evt_2",
          kind: "payment_failed",
          objectId: "in_9",
          amountCents: null,
          emailMasked: null,
        }),
      ],
      [configRow({ externalId: "prod_pro" })],
      "basin",
      "development",
    );

    expect(detail).toEqual({
      environment: "development",
      dashboardUrl: "https://dashboard.stripe.com/test/products/prod_pro",
      plans: [
        {
          productId: "prod_pro",
          plan: "Pro",
          monthlyRevenue: 312,
          subscribers: 78,
        },
      ],
      events: [
        {
          id: "evt_1",
          kind: "new",
          occurredAt: "2026-09-19T10:00:00.000Z",
          email: "m••••a@hey.com",
          plan: "Pro",
          amount: 4,
          url: "https://dashboard.stripe.com/test/subscriptions/sub_1",
        },
        {
          id: "evt_2",
          kind: "payment_failed",
          occurredAt: "2026-09-19T10:00:00.000Z",
          email: null,
          plan: "Pro",
          amount: null,
          url: "https://dashboard.stripe.com/test/invoices/in_9",
        },
      ],
    });
  });
});
