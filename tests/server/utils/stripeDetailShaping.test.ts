import { afterEach, describe, expect, it, vi } from "vitest";
import {
  stripeAppDashboardUrl,
  stripeDashboardLink,
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
const liveLink = (path: string) => `${LIVE_BASE}${path}`;

describe("stripeDashboardLink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("links the live dashboard for production keys and an unknown environment", () => {
    expect(stripeDashboardLink("basin", "production")("/products")).toBe(
      `${LIVE_BASE}/products`,
    );
    expect(stripeDashboardLink("basin", null)("/products")).toBe(
      `${LIVE_BASE}/products`,
    );
  });

  it("links the test-mode dashboard for development keys", () => {
    expect(stripeDashboardLink("basin", "development")("/products")).toBe(
      `${LIVE_BASE}/test/products`,
    );
  });

  it("switches to the app's own Stripe account before opening the path", () => {
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_BASIN", "acct_basin");
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_MARKPOST", "acct_markpost");

    expect(
      stripeDashboardLink("basin", "development")("/products/prod_1"),
    ).toBe(`${LIVE_BASE}/b/acct_basin?destination=%2Ftest%2Fproducts%2Fprod_1`);
    expect(stripeDashboardLink("markpost", "production")("/products")).toBe(
      `${LIVE_BASE}/b/acct_markpost?destination=%2Fproducts`,
    );
  });

  it("links the plain path when the app's account id is blank", () => {
    vi.stubEnv("NUXT_STRIPE_ACCOUNT_ID_BASIN", "   ");

    expect(stripeDashboardLink("basin", "production")("/products")).toBe(
      `${LIVE_BASE}/products`,
    );
  });
});

describe("stripeObjectUrl", () => {
  it("links subscriptions and invoices", () => {
    expect(stripeObjectUrl(liveLink, "sub_1")).toBe(
      `${LIVE_BASE}/subscriptions/sub_1`,
    );
    expect(stripeObjectUrl(liveLink, "in_1")).toBe(
      `${LIVE_BASE}/invoices/in_1`,
    );
  });

  it("returns null for an object id it doesn't know how to link", () => {
    expect(stripeObjectUrl(liveLink, "ch_1")).toBeNull();
  });
});

describe("stripeAppDashboardUrl", () => {
  it("links the single product page when the app has one product", () => {
    expect(stripeAppDashboardUrl(liveLink, ["prod_pro"])).toBe(
      `${LIVE_BASE}/products/prod_pro`,
    );
  });

  it("links the product list when there are several products or none yet", () => {
    expect(stripeAppDashboardUrl(liveLink, ["a", "b"])).toBe(
      `${LIVE_BASE}/products`,
    );
    expect(stripeAppDashboardUrl(liveLink, [])).toBe(`${LIVE_BASE}/products`);
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
      "https://dashboard.stripe.com/b/acct_basin?destination=%2Ftest%2Fproducts%2Fprod_pro",
    );
    expect(detail?.events[0]?.url).toBe(
      "https://dashboard.stripe.com/b/acct_basin?destination=%2Ftest%2Fsubscriptions%2Fsub_1",
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
