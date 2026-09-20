import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { toStripeSubscription } from "../../../../server/integrations/stripe/mapping";

function buildStripeSubscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_123",
    status: "active",
    items: {
      data: [
        {
          id: "si_123",
          quantity: 2,
          price: {
            id: "price_123",
            unit_amount: 900,
            currency: "usd",
            product: "prod_123",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    ...overrides,
  } as Stripe.Subscription;
}

describe("toStripeSubscription", () => {
  it("maps Stripe's snake_case SDK shape to this package's plain, camelCase types", () => {
    const subscription = buildStripeSubscription();

    expect(toStripeSubscription(subscription)).toEqual({
      id: "sub_123",
      status: "active",
      items: {
        data: [
          {
            id: "si_123",
            quantity: 2,
            price: {
              id: "price_123",
              unitAmount: 900,
              currency: "usd",
              product: "prod_123",
              recurring: { interval: "month", intervalCount: 1 },
            },
          },
        ],
      },
    });
  });

  it("maps a null recurring block to null (a one-time price on a subscription item)", () => {
    const subscription = buildStripeSubscription({
      items: {
        data: [
          {
            id: "si_one_time",
            quantity: 1,
            price: {
              id: "price_one_time",
              unit_amount: 500,
              currency: "usd",
              product: "prod_123",
              recurring: null,
            },
          },
        ],
      } as Stripe.Subscription["items"],
    });

    expect(
      toStripeSubscription(subscription).items.data[0]?.price.recurring,
    ).toBeNull();
  });

  it("defaults a missing quantity (metered/usage items) to null rather than throwing", () => {
    const subscription = buildStripeSubscription({
      items: {
        data: [
          {
            id: "si_metered",
            quantity: undefined,
            price: {
              id: "price_metered",
              unit_amount: 100,
              currency: "usd",
              product: "prod_123",
              recurring: { interval: "month", interval_count: 1 },
            },
          },
        ],
      } as Stripe.Subscription["items"],
    });

    expect(
      toStripeSubscription(subscription).items.data[0]?.quantity,
    ).toBeNull();
  });

  it("fails loud if price.product was expanded into an object instead of left as a bare id", () => {
    const subscription = buildStripeSubscription({
      items: {
        data: [
          {
            id: "si_expanded",
            quantity: 1,
            price: {
              id: "price_expanded",
              unit_amount: 100,
              currency: "usd",
              product: { id: "prod_123" },
              recurring: { interval: "month", interval_count: 1 },
            },
          },
        ],
      } as unknown as Stripe.Subscription["items"],
    });

    expect(() => toStripeSubscription(subscription)).toThrow(
      /must list subscriptions without expanding product/,
    );
  });

  it("passes an interval Stripe's SDK doesn't have a literal for straight through, unvalidated", () => {
    // mapping.ts deliberately doesn't validate `interval` against a known
    // set — see StripeRecurring["interval"]'s comment (./types.ts). That
    // validation happens in mrr.ts's monthlyIntervalDivisor instead, scoped
    // to only the items that matter for one app's MRR (see mrr.test.ts's
    // "fails loud on a recurring interval" case) rather than failing every
    // app's sync over one subscription elsewhere in the shared account.
    const subscription = buildStripeSubscription({
      items: {
        data: [
          {
            id: "si_unknown_interval",
            quantity: 1,
            price: {
              id: "price_unknown_interval",
              unit_amount: 100,
              currency: "usd",
              product: "prod_123",
              recurring: { interval: "fortnight", interval_count: 1 },
            },
          },
        ],
      } as unknown as Stripe.Subscription["items"],
    });

    expect(
      toStripeSubscription(subscription).items.data[0]?.price.recurring,
    ).toEqual({ interval: "fortnight", intervalCount: 1 });
  });
});
