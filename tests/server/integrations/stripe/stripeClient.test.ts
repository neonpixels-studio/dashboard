import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createStripeSubscriptionLister } from "../../../../server/integrations/stripe/stripeClient";
import {
  createDeadline,
  createExhaustedDeadline,
} from "../../../../server/integrations/testing/deadlineFixtures";

function buildStripeSubscription(
  id: string,
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id,
    status: "active",
    items: {
      data: [
        {
          id: `si_${id}`,
          quantity: 1,
          price: {
            id: `price_${id}`,
            unit_amount: 900,
            currency: "usd",
            product: "prod_test",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
      has_more: false,
    },
    ...overrides,
  } as Stripe.Subscription;
}

function buildStubStripeClient(
  list: Stripe.Subscriptions["list"],
): Pick<Stripe, "subscriptions"> {
  return { subscriptions: { list } as Stripe["subscriptions"] };
}

describe("createStripeSubscriptionLister", () => {
  it("requests active subscriptions and passes the cursor through as starting_after", async () => {
    const list = vi.fn(async () => ({
      data: [buildStripeSubscription("sub_1")],
      has_more: false,
    }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
    );

    await listActiveSubscriptions("sub_cursor");

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        starting_after: "sub_cursor",
      }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("calls without a cursor on the first page", async () => {
    const list = vi.fn(async () => ({ data: [], has_more: false }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
    );

    await listActiveSubscriptions();

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ starting_after: undefined }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("maps the SDK's snake_case has_more to this package's hasMore", async () => {
    const list = vi.fn(async () => ({
      data: [buildStripeSubscription("sub_1")],
      has_more: true,
    }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
    );

    const page = await listActiveSubscriptions();

    expect(page.hasMore).toBe(true);
    expect(page.data).toEqual([
      {
        id: "sub_1",
        status: "active",
        items: {
          data: [
            {
              id: "si_sub_1",
              quantity: 1,
              price: {
                id: "price_sub_1",
                unitAmount: 900,
                currency: "usd",
                product: "prod_test",
                recurring: { interval: "month", intervalCount: 1 },
              },
            },
          ],
        },
      },
    ]);
  });

  it("divides what's left of a shared deadline across every attempt Stripe might make (including retries), when that's less than the client's own fixed timeout", async () => {
    const list = vi.fn(async () => ({ data: [], has_more: false }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
      createDeadline(900),
    );

    await listActiveSubscriptions();

    // 900ms / (1 initial attempt + 2 retries) = 300ms per attempt — a
    // retried call's total worst-case duration then stays close to the
    // 900ms that was actually left, rather than up to 3x that.
    expect(list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 300 }),
    );
  });

  it("gives each attempt the full fixed timeout when there's no real deadline constraining it", async () => {
    const list = vi.fn(async () => ({ data: [], has_more: false }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
      // No deadline passed at all -> defaults to NO_DEADLINE (remainingMs is
      // Infinity) — this client's un-deadlined behavior must stay exactly
      // what it was before FetchDeadline existed, not get divided by
      // attempts for no reason.
    );

    await listActiveSubscriptions();

    expect(list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 20_000 }),
    );
  });

  it("throws instead of placing a call once the shared deadline is already exhausted, rather than sending a request with no effective timeout", async () => {
    const list = vi.fn(async () => ({ data: [], has_more: false }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
      createExhaustedDeadline(),
    );

    await expect(listActiveSubscriptions()).rejects.toThrow(
      /shared run budget was already exhausted/,
    );
    // A `timeout: 0` request option means "no timeout" to Stripe's
    // underlying HTTP client, not "expire immediately" — this call must
    // never be placed at all once the deadline is spent.
    expect(list).not.toHaveBeenCalled();
  });
});
