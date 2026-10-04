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
          discounts: [],
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
    discounts: [],
    ...overrides,
  } as Stripe.Subscription;
}

function buildStubStripeClient(
  list: Stripe.Subscriptions["list"],
  retrieveCoupon: Stripe.CouponsResource["retrieve"] = vi.fn() as never,
): Pick<Stripe, "subscriptions" | "coupons"> {
  return {
    subscriptions: { list } as Stripe["subscriptions"],
    coupons: { retrieve: retrieveCoupon } as Stripe["coupons"],
  };
}

describe("createStripeSubscriptionLister", () => {
  it("requests non-canceled subscriptions with discounts expanded and passes the cursor through as starting_after", async () => {
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
        starting_after: "sub_cursor",
        limit: 100,
        expand: ["data.discounts", "data.items.data.discounts"],
      }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("does not send a status filter to Stripe, so the status policy stays in mrr.ts", async () => {
    const list = vi.fn(async () => ({ data: [], has_more: false }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
    );

    await listActiveSubscriptions();

    expect(list.mock.calls[0]?.[0]).not.toHaveProperty("status");
  });

  it("never requests an expand path deeper than Stripe's four-property limit", async () => {
    const list = vi.fn(async () => ({ data: [], has_more: false }));
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list),
    );

    await listActiveSubscriptions();

    const [params] = list.mock.calls[0] as unknown as [{ expand: string[] }];
    for (const path of params.expand) {
      expect(path.split(".").length).toBeLessThanOrEqual(4);
    }
  });

  it("resolves bare coupon ids on subscription and item discounts, retrieving each distinct coupon once", async () => {
    const discount = {
      id: "di_1",
      start: 1,
      end: null,
      source: { type: "coupon", coupon: "co_1" },
    };
    const subscription = buildStripeSubscription("sub_1", {
      discounts: [discount as unknown as Stripe.Discount],
    });
    (subscription.items.data[0] as { discounts: unknown[] }).discounts = [
      discount,
    ];
    const list = vi.fn(async () => ({ data: [subscription], has_more: false }));
    const retrieveCoupon = vi.fn(async () => ({
      id: "co_1",
      percent_off: 20,
      amount_off: null,
      currency: null,
      duration: "forever",
    })) as never;
    const listActiveSubscriptions = createStripeSubscriptionLister(
      "sk_test_unused",
      buildStubStripeClient(list, retrieveCoupon),
    );

    const page = await listActiveSubscriptions();

    const expected = {
      percentOff: 20,
      amountOff: null,
      currency: null,
      duration: "forever",
      start: 1,
      end: null,
    };
    expect(page.data[0]?.discounts).toEqual([expected]);
    expect(page.data[0]?.items.data[0]?.discounts).toEqual([expected]);
    expect(retrieveCoupon).toHaveBeenCalledTimes(1);
  });

  describe("uncounted subscription statuses", () => {
    function buildSubscriptionWithCoupon(
      id: string,
      status: Stripe.Subscription.Status,
    ): Stripe.Subscription {
      const discount = {
        id: `di_${id}`,
        start: 1,
        end: null,
        source: { type: "coupon", coupon: `co_${id}` },
      };
      return buildStripeSubscription(id, {
        status,
        discounts: [discount as unknown as Stripe.Discount],
      });
    }

    it.each(["trialing", "unpaid", "incomplete", "paused"] as const)(
      "does not retrieve coupons for, or fail on a deleted coupon of, a %s subscription",
      async (status) => {
        const list = vi.fn(async () => ({
          data: [buildSubscriptionWithCoupon("sub_1", status)],
          has_more: false,
        }));
        const retrieveCoupon = vi.fn(async () => {
          throw new Error("No such coupon");
        }) as never;
        const listActiveSubscriptions = createStripeSubscriptionLister(
          "sk_test_unused",
          buildStubStripeClient(list, retrieveCoupon),
        );

        const page = await listActiveSubscriptions();

        expect(page.data).toEqual([]);
        expect(retrieveCoupon).not.toHaveBeenCalled();
      },
    );

    it("still resolves coupons for counted subscriptions on the same page", async () => {
      const list = vi.fn(async () => ({
        data: [
          buildSubscriptionWithCoupon("sub_trial", "trialing"),
          buildSubscriptionWithCoupon("sub_active", "active"),
          buildSubscriptionWithCoupon("sub_past_due", "past_due"),
        ],
        has_more: true,
      }));
      const retrieveCoupon = vi.fn(async (couponId: string) => ({
        id: couponId,
        percent_off: 10,
        amount_off: null,
        currency: null,
        duration: "forever",
      })) as never;
      const listActiveSubscriptions = createStripeSubscriptionLister(
        "sk_test_unused",
        buildStubStripeClient(list, retrieveCoupon),
      );

      const page = await listActiveSubscriptions();

      expect(page.data.map((subscription) => subscription.id)).toEqual([
        "sub_active",
        "sub_past_due",
      ]);
      expect(page.hasMore).toBe(true);
      expect(retrieveCoupon).toHaveBeenCalledTimes(2);
      expect(retrieveCoupon).not.toHaveBeenCalledWith(
        "co_sub_trial",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("when a coupon lookup fails", () => {
    function buildSubscriptionWithCouponId(): Stripe.Subscription {
      return buildStripeSubscription("sub_1", {
        discounts: [
          {
            id: "di_1",
            start: 1,
            end: null,
            source: { type: "coupon", coupon: "co_gone" },
          } as unknown as Stripe.Discount,
        ],
      });
    }

    it("fails loud naming the coupon", async () => {
      const list = vi.fn(async () => ({
        data: [buildSubscriptionWithCouponId()],
        has_more: false,
      }));
      const retrieveCoupon = vi.fn(async () => {
        throw new Error("No such coupon");
      }) as never;
      const listActiveSubscriptions = createStripeSubscriptionLister(
        "sk_test_unused",
        buildStubStripeClient(list, retrieveCoupon),
      );

      await expect(listActiveSubscriptions()).rejects.toThrow(
        /coupon "co_gone".*No such coupon/,
      );
    });

    it("does not cache the failure, so a later call retries the lookup", async () => {
      const list = vi.fn(async () => ({
        data: [buildSubscriptionWithCouponId()],
        has_more: false,
      }));
      const retrieveCoupon = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue({
          id: "co_gone",
          percent_off: 10,
          amount_off: null,
          currency: null,
          duration: "forever",
        }) as never;
      const listActiveSubscriptions = createStripeSubscriptionLister(
        "sk_test_unused",
        buildStubStripeClient(list, retrieveCoupon),
      );

      await expect(listActiveSubscriptions()).rejects.toThrow(/timeout/);
      const page = await listActiveSubscriptions();

      expect(page.data[0]?.discounts[0]?.percentOff).toBe(10);
    });

    it("does not retrieve coupons once the shared run budget is exhausted", async () => {
      const list = vi.fn(async () => ({
        data: [buildSubscriptionWithCouponId()],
        has_more: false,
      }));
      const retrieveCoupon = vi.fn() as never;
      const deadline = createDeadline(10_000);
      const listActiveSubscriptions = createStripeSubscriptionLister(
        "sk_test_unused",
        buildStubStripeClient(list, retrieveCoupon),
        deadline,
      );
      vi.spyOn(deadline, "remainingMs")
        .mockReturnValueOnce(10_000)
        .mockReturnValue(0);

      await expect(listActiveSubscriptions()).rejects.toThrow(
        /shared run budget was already exhausted/,
      );
      expect(retrieveCoupon).not.toHaveBeenCalled();
    });
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
              discounts: [],
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
        discounts: [],
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
