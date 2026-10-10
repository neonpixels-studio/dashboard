import type Stripe from "stripe";
import { ACTIVITY_LOOKBACK_DAYS } from "./activity";
import { MILLISECONDS_PER_SECOND } from "./mrr";
import { NO_DEADLINE, type FetchDeadline } from "../types";
import {
  createStripeSdkClient,
  perAttemptTimeoutOrThrow,
} from "./stripeClient";
import type {
  StripeActivityEvent,
  StripeActivityKind,
  StripeActivityLine,
  StripeActivityPage,
  StripeDetailSource,
} from "./types";

const EVENTS_PAGE_SIZE = 100;
const SECONDS_PER_DAY = 24 * 60 * 60;
const DEFAULT_SUBSCRIPTION_QUANTITY = 1;

const SUBSCRIPTION_EVENT_KINDS: Record<string, StripeActivityKind> = {
  "customer.subscription.created": "new",
  "customer.subscription.deleted": "canceled",
};
const PAYMENT_FAILED_EVENT_TYPE = "invoice.payment_failed";
const ACTIVITY_EVENT_TYPES = [
  ...Object.keys(SUBSCRIPTION_EVENT_KINDS),
  PAYMENT_FAILED_EVENT_TYPE,
];

// Only the slice of the real client this module calls, so tests can pass a
// lightweight double instead of a client built from a real secret key.
export type StripeDetailClient = Pick<
  Stripe,
  "events" | "customers" | "products"
>;

function idOf(reference: string | { id: string }): string {
  return typeof reference === "string" ? reference : reference.id;
}

function customerIdOf(
  customer: string | { id: string } | null | undefined,
): string | null {
  return customer ? idOf(customer) : null;
}

function subscriptionLines(
  subscription: Stripe.Subscription,
): StripeActivityLine[] {
  return subscription.items.data.map((item) => ({
    productId: idOf(item.price.product),
    amountCents:
      item.price.unit_amount === null
        ? null
        : item.price.unit_amount *
          (item.quantity ?? DEFAULT_SUBSCRIPTION_QUANTITY),
  }));
}

function invoiceLines(invoice: Stripe.Invoice): StripeActivityLine[] {
  return invoice.lines.data.flatMap((line) => {
    const productId = line.pricing?.price_details?.product;
    return productId ? [{ productId, amountCents: line.amount }] : [];
  });
}

function subscriptionActivity(
  event: Stripe.Event,
  kind: StripeActivityKind,
): StripeActivityEvent {
  const subscription = event.data.object as Stripe.Subscription;
  return {
    id: event.id,
    kind,
    occurredAt: event.created,
    objectId: subscription.id,
    currency: subscription.currency,
    customerId: customerIdOf(subscription.customer),
    customerEmail: null,
    lines: subscriptionLines(subscription),
  };
}

function paymentFailedActivity(
  event: Stripe.Event,
): StripeActivityEvent | null {
  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice.id) {
    return null;
  }
  return {
    id: event.id,
    kind: "payment_failed",
    occurredAt: event.created,
    objectId: invoice.id,
    currency: invoice.currency,
    customerId: customerIdOf(invoice.customer),
    customerEmail: invoice.customer_email,
    lines: invoiceLines(invoice),
  };
}

/** Flattens one Stripe event; null for an event type this panel ignores. */
export function toActivityEvent(
  event: Stripe.Event,
): StripeActivityEvent | null {
  const subscriptionKind = SUBSCRIPTION_EVENT_KINDS[event.type];
  if (subscriptionKind) {
    return subscriptionActivity(event, subscriptionKind);
  }
  if (event.type === PAYMENT_FAILED_EVENT_TYPE) {
    return paymentFailedActivity(event);
  }
  return null;
}

function memoizeById<Value>(
  load: (id: string) => Promise<Value>,
): (id: string) => Promise<Value> {
  const cache = new Map<string, Promise<Value>>();
  return (id) => {
    const cached = cache.get(id);
    if (cached) {
      return cached;
    }
    const pending = load(id).catch((error: unknown) => {
      cache.delete(id);
      throw error;
    });
    cache.set(id, pending);
    return pending;
  };
}

function activityWindowStart(now: Date): number {
  return (
    Math.floor(now.getTime() / MILLISECONDS_PER_SECOND) -
    ACTIVITY_LOOKBACK_DAYS * SECONDS_PER_DAY
  );
}

/**
 * Builds the real, network-touching `StripeDetailSource`. Customer and product
 * lookups are memoized for the source's lifetime (one sync), so a handful of
 * customers/products cost one retrieve each, not one per event.
 */
export function createStripeDetailSource(
  secretKey: string,
  stripeClient: StripeDetailClient = createStripeSdkClient(secretKey),
  deadline: FetchDeadline = NO_DEADLINE,
  now: () => Date = () => new Date(),
): StripeDetailSource {
  const requestOptions = () => ({
    timeout: perAttemptTimeoutOrThrow(deadline),
  });

  const getCustomerEmail = memoizeById(async (customerId) => {
    const customer = await stripeClient.customers.retrieve(
      customerId,
      {},
      requestOptions(),
    );
    return customer.deleted ? null : customer.email;
  });

  const getProductName = memoizeById(async (productId) => {
    const product = await stripeClient.products.retrieve(
      productId,
      {},
      requestOptions(),
    );
    return product.deleted ? productId : product.name;
  });

  async function listActivityEvents(
    startingAfter?: string,
  ): Promise<StripeActivityPage> {
    const page = await stripeClient.events.list(
      {
        types: ACTIVITY_EVENT_TYPES,
        created: { gte: activityWindowStart(now()) },
        limit: EVENTS_PAGE_SIZE,
        starting_after: startingAfter,
      },
      requestOptions(),
    );
    return {
      data: page.data.flatMap((event) => {
        const activity = toActivityEvent(event);
        return activity ? [activity] : [];
      }),
      hasMore: page.has_more,
      nextCursor: page.data.at(-1)?.id,
    };
  }

  return { listActivityEvents, getCustomerEmail, getProductName };
}
