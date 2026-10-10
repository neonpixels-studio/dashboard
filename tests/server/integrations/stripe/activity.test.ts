import { describe, expect, it, vi } from "vitest";
import {
  MAX_ACTIVITY_PAGES,
  buildEventRows,
  fetchActivityEvents,
  maskEmail,
} from "../../../../server/integrations/stripe/activity";
import type {
  StripeActivityEvent,
  StripeActivityPage,
  StripeDetailSource,
} from "../../../../server/integrations/stripe/types";

function activityEvent(
  overrides: Partial<StripeActivityEvent> = {},
): StripeActivityEvent {
  return {
    id: "evt_1",
    kind: "new",
    occurredAt: 1_790_000_000,
    objectId: "sub_1",
    currency: "usd",
    customerId: "cus_1",
    customerEmail: null,
    lines: [{ productId: "prod_pro", amountCents: 400 }],
    ...overrides,
  };
}

const PRODUCT_IDS = new Set(["prod_pro"]);
const PLAN_NAMES = new Map([["prod_pro", "Pro"]]);

describe("maskEmail", () => {
  it.each([
    ["maria@hey.com", "m••••a@hey.com"],
    ["jo@fastmail.com", "j••••@fastmail.com"],
    ["a@x.io", "a••••@x.io"],
    ["first.last+tag@proton.me", "f••••g@proton.me"],
  ])("masks %s as %s", (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it.each([[null], [""], ["no-at-sign"], ["@nolocal.com"]])(
    "returns null for %s rather than echoing it back",
    (email) => {
      expect(maskEmail(email)).toBeNull();
    },
  );

  it("never contains the full local part of a longer address", () => {
    expect(maskEmail("sensitive.person@gmail.com")).not.toContain("sensitive");
  });
});

describe("fetchActivityEvents", () => {
  function pagedSource(pages: StripeActivityPage[]) {
    const listActivityEvents = vi.fn(async (_cursor?: string) =>
      pages.shift()!,
    );
    return { listActivityEvents } as unknown as StripeDetailSource & {
      listActivityEvents: typeof listActivityEvents;
    };
  }

  it("follows the cursor across pages until has_more is false", async () => {
    const source = pagedSource([
      {
        data: [activityEvent({ id: "evt_a" })],
        hasMore: true,
        nextCursor: "evt_a",
      },
      { data: [activityEvent({ id: "evt_b" })], hasMore: false },
    ]);

    const events = await fetchActivityEvents(source);

    expect(events.map((event) => event.id)).toEqual(["evt_a", "evt_b"]);
    expect(source.listActivityEvents).toHaveBeenNthCalledWith(1, undefined);
    expect(source.listActivityEvents).toHaveBeenNthCalledWith(2, "evt_a");
  });

  it("stops at MAX_ACTIVITY_PAGES even if Stripe keeps claiming more", async () => {
    const listActivityEvents = vi.fn(async () => ({
      data: [activityEvent()],
      hasMore: true,
      nextCursor: "evt_next",
    }));

    await fetchActivityEvents({
      listActivityEvents,
    } as unknown as StripeDetailSource);

    expect(listActivityEvents).toHaveBeenCalledTimes(MAX_ACTIVITY_PAGES);
  });

  it("stops instead of looping when a page claims more but gives no cursor", async () => {
    const listActivityEvents = vi.fn(async () => ({ data: [], hasMore: true }));

    await fetchActivityEvents({
      listActivityEvents,
    } as unknown as StripeDetailSource);

    expect(listActivityEvents).toHaveBeenCalledTimes(1);
  });
});

describe("buildEventRows", () => {
  it("shapes a matching subscription event with the looked-up email masked", async () => {
    const getCustomerEmail = vi.fn(async () => "maria@hey.com");

    const [row] = await buildEventRows(
      [activityEvent()],
      PRODUCT_IDS,
      PLAN_NAMES,
      { getCustomerEmail },
    );

    expect(row).toEqual({
      eventId: "evt_1",
      kind: "new",
      occurredAt: new Date(1_790_000_000 * 1000),
      emailMasked: "m••••a@hey.com",
      planName: "Pro",
      amountCents: 400,
      objectId: "sub_1",
    });
    expect(getCustomerEmail).toHaveBeenCalledWith("cus_1");
  });

  it("uses the email already on the event (invoices) without a customer lookup", async () => {
    const getCustomerEmail = vi.fn();

    const [row] = await buildEventRows(
      [
        activityEvent({
          kind: "payment_failed",
          objectId: "in_1",
          customerEmail: "robert@proton.me",
        }),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      { getCustomerEmail },
    );

    expect(row?.emailMasked).toBe("r••••t@proton.me");
    expect(row?.kind).toBe("payment_failed");
    expect(getCustomerEmail).not.toHaveBeenCalled();
  });

  it("drops events for other apps' products without looking up their customers", async () => {
    const getCustomerEmail = vi.fn();

    const rows = await buildEventRows(
      [
        activityEvent({
          lines: [{ productId: "prod_other", amountCents: 900 }],
        }),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      { getCustomerEmail },
    );

    expect(rows).toEqual([]);
    expect(getCustomerEmail).not.toHaveBeenCalled();
  });

  it("sums only the matching lines of a mixed event", async () => {
    const [row] = await buildEventRows(
      [
        activityEvent({
          customerId: null,
          lines: [
            { productId: "prod_pro", amountCents: 400 },
            { productId: "prod_other", amountCents: 900 },
          ],
        }),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      { getCustomerEmail: vi.fn() },
    );

    expect(row?.amountCents).toBe(400);
    expect(row?.emailMasked).toBeNull();
  });

  it("gives a null amount, not a partial or zero total, when a matching line has no flat price", async () => {
    const [row] = await buildEventRows(
      [
        activityEvent({
          customerId: null,
          lines: [
            { productId: "prod_pro", amountCents: 400 },
            { productId: "prod_pro", amountCents: null },
          ],
        }),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      { getCustomerEmail: vi.fn() },
    );

    expect(row?.amountCents).toBeNull();
  });

  it("looks customers up one at a time so a busy account can't burst Stripe's rate limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const getCustomerEmail = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return "a@b.co";
    });

    await buildEventRows(
      [
        activityEvent({ id: "evt_1", customerId: "cus_1" }),
        activityEvent({ id: "evt_2", customerId: "cus_2" }),
        activityEvent({ id: "evt_3", customerId: "cus_3" }),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      { getCustomerEmail },
    );

    expect(maxInFlight).toBe(1);
  });

  it("fails loud on a non-USD event rather than showing the wrong currency", async () => {
    await expect(
      buildEventRows(
        [activityEvent({ currency: "eur" })],
        PRODUCT_IDS,
        PLAN_NAMES,
        {
          getCustomerEmail: vi.fn(),
        },
      ),
    ).rejects.toThrow(/"eur"/);
  });
});
