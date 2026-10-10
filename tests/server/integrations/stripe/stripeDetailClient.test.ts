import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  createStripeDetailSource,
  toActivityEvent,
} from "../../../../server/integrations/stripe/stripeDetailClient";
import { createExhaustedDeadline } from "../../../../server/integrations/testing/deadlineFixtures";

function stripeEvent(
  type: string,
  object: unknown,
  id = "evt_1",
): Stripe.Event {
  return { id, type, created: 1_790_000_000, data: { object } } as Stripe.Event;
}

const SUBSCRIPTION = {
  id: "sub_1",
  status: "active",
  currency: "usd",
  customer: "cus_1",
  items: {
    data: [
      { quantity: 2, price: { unit_amount: 400, product: "prod_pro" } },
      {
        quantity: null,
        price: { unit_amount: 100, product: { id: "prod_add" } },
      },
    ],
  },
};

const INVOICE = {
  id: "in_1",
  currency: "usd",
  customer: { id: "cus_2" },
  customer_email: "robert@proton.me",
  lines: {
    data: [
      { amount: 400, pricing: { price_details: { product: "prod_pro" } } },
      { amount: 50, pricing: null },
    ],
  },
};

describe("toActivityEvent", () => {
  it("maps a subscription.created event, multiplying unit amount by quantity", () => {
    expect(
      toActivityEvent(
        stripeEvent("customer.subscription.created", SUBSCRIPTION),
      ),
    ).toEqual({
      id: "evt_1",
      kind: "new",
      occurredAt: 1_790_000_000,
      objectId: "sub_1",
      currency: "usd",
      subscriptionStatus: "active",
      customerId: "cus_1",
      customerEmail: null,
      lines: [
        { productId: "prod_pro", amountCents: 800 },
        { productId: "prod_add", amountCents: 100 },
      ],
    });
  });

  it("gives a tiered/metered item a null amount instead of a fake zero", () => {
    const tiered = {
      ...SUBSCRIPTION,
      items: {
        data: [
          { quantity: 1, price: { unit_amount: null, product: "prod_pro" } },
        ],
      },
    };

    expect(
      toActivityEvent(stripeEvent("customer.subscription.created", tiered))
        ?.lines,
    ).toEqual([{ productId: "prod_pro", amountCents: null }]);
  });

  it("maps subscription.deleted to a canceled event", () => {
    expect(
      toActivityEvent(
        stripeEvent("customer.subscription.deleted", SUBSCRIPTION),
      )?.kind,
    ).toBe("canceled");
  });

  it("maps invoice.payment_failed with the invoice's email and skips lines without a product", () => {
    expect(
      toActivityEvent(stripeEvent("invoice.payment_failed", INVOICE)),
    ).toEqual({
      id: "evt_1",
      kind: "payment_failed",
      occurredAt: 1_790_000_000,
      objectId: "in_1",
      currency: "usd",
      subscriptionStatus: null,
      customerId: "cus_2",
      customerEmail: "robert@proton.me",
      lines: [{ productId: "prod_pro", amountCents: 400 }],
    });
  });

  it("ignores event types the panel doesn't show", () => {
    expect(toActivityEvent(stripeEvent("customer.created", {}))).toBeNull();
  });

  it("ignores an invoice event with no invoice id", () => {
    expect(
      toActivityEvent(
        stripeEvent("invoice.payment_failed", { ...INVOICE, id: null }),
      ),
    ).toBeNull();
  });
});

function stubClient(overrides: Record<string, unknown> = {}) {
  return {
    events: {
      list: vi.fn(async () => ({
        data: [stripeEvent("customer.subscription.created", SUBSCRIPTION)],
        has_more: true,
      })),
    },
    customers: {
      retrieve: vi.fn(async () => ({ deleted: false, email: "maria@hey.com" })),
    },
    products: {
      retrieve: vi.fn(async () => ({ deleted: false, name: "Pro" })),
    },
    ...overrides,
  } as unknown as Parameters<typeof createStripeDetailSource>[1];
}

describe("createStripeDetailSource", () => {
  it("lists only the three activity event types inside the 30 day window, passing the cursor along", async () => {
    const client = stubClient();
    const source = createStripeDetailSource(
      "sk_test_unused",
      client,
      undefined,
      () => new Date("2026-09-30T00:00:00Z"),
    );

    const page = await source.listActivityEvents("evt_cursor");

    expect(client!.events.list).toHaveBeenCalledWith(
      {
        types: [
          "customer.subscription.created",
          "customer.subscription.deleted",
          "invoice.payment_failed",
        ],
        created: {
          gte: Math.floor(new Date("2026-08-31T00:00:00Z").getTime() / 1000),
        },
        limit: 100,
        starting_after: "evt_cursor",
      },
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("evt_1");
    expect(page.data).toHaveLength(1);
  });

  it("memoizes customer and product lookups", async () => {
    const client = stubClient();
    const source = createStripeDetailSource("sk_test_unused", client);

    await source.getCustomerEmail("cus_1");
    await source.getCustomerEmail("cus_1");
    await source.getProductName("prod_pro");
    await source.getProductName("prod_pro");

    expect(client!.customers.retrieve).toHaveBeenCalledTimes(1);
    expect(client!.products.retrieve).toHaveBeenCalledTimes(1);
  });

  it("returns null for a deleted customer and the id for a deleted product", async () => {
    const source = createStripeDetailSource(
      "sk_test_unused",
      stubClient({
        customers: { retrieve: vi.fn(async () => ({ deleted: true })) },
        products: { retrieve: vi.fn(async () => ({ deleted: true })) },
      }),
    );

    await expect(source.getCustomerEmail("cus_gone")).resolves.toBeNull();
    await expect(source.getProductName("prod_gone")).resolves.toBe("prod_gone");
  });

  it("does not cache a failed lookup", async () => {
    const retrieve = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ deleted: false, email: "a@b.co" });
    const source = createStripeDetailSource(
      "sk_test_unused",
      stubClient({ customers: { retrieve } }),
    );

    await expect(source.getCustomerEmail("cus_1")).rejects.toThrow("boom");
    await expect(source.getCustomerEmail("cus_1")).resolves.toBe("a@b.co");
  });

  it("refuses to call Stripe once the shared run budget is exhausted", async () => {
    const client = stubClient();
    const source = createStripeDetailSource(
      "sk_test_unused",
      client,
      createExhaustedDeadline(),
    );

    await expect(source.listActivityEvents()).rejects.toThrow(
      /shared run budget was already exhausted/,
    );
    expect(client!.events.list).not.toHaveBeenCalled();
  });
});
