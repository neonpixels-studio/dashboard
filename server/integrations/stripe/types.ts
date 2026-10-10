import type { StripeEventKind } from "../../../shared/types/dashboard";

// Plain, JSON-serializable subset of the Stripe API shapes this provider
// needs. Deliberately NOT the `stripe` package's own `Stripe.Subscription` /
// `Stripe.Price` types: those model every field Stripe can return (including
// the `price.product` union that only becomes a bare string when the caller
// doesn't `expand` it), which would leak that ambiguity into every pure
// function below. server/integrations/stripe/mapping.ts is the one place
// that translates the real SDK response into this narrower, unambiguous
// shape; everything downstream (mrr.ts, provider.ts, and their tests) only
// ever sees this file's types, and test fixtures are recorded directly in
// this shape.
export interface StripeRecurring {
  // Deliberately `string`, not a `"day" | "week" | "month" | "year"` union:
  // validating against the known set happens once, narrowly, in
  // mrr.ts's monthlyIntervalDivisor — the one place that actually needs a
  // formula per interval, and which only ever runs on items already
  // filtered down to one app's product ids. Rejecting an unrecognized
  // interval any earlier (e.g. while mapping every subscription in the
  // shared Stripe account, before any app-specific filtering) would fail
  // every app's sync over one subscription that may belong to none of them.
  interval: string;
  intervalCount: number;
}

export interface StripePrice {
  id: string;
  unitAmount: number | null;
  currency: string;
  // Always a bare product id string here — see the file comment above.
  product: string;
  recurring: StripeRecurring | null;
}

// One discount currently attached to a subscription or subscription item,
// already resolved from Stripe's discount + coupon objects. `end` is a unix
// timestamp in seconds. Stripe derives it from the coupon's
// duration_in_months for `repeating` coupons; it is null for both `forever`
// and `once`, so `duration` is carried too (a `once` coupon is a one-time
// cut, not recurring, and never reduces MRR).
export interface StripeDiscount {
  percentOff: number | null;
  // Smallest currency unit, applied once per invoice (not per month).
  amountOff: number | null;
  currency: string | null;
  duration: string;
  start: number;
  end: number | null;
  // Product ids the coupon is restricted to (Stripe's `applies_to.products`);
  // null means unrestricted, so it applies to every item.
  appliesToProducts: string[] | null;
}

export interface StripeSubscriptionItem {
  id: string;
  quantity: number | null;
  price: StripePrice;
  discounts: StripeDiscount[];
}

export interface StripeSubscription {
  id: string;
  status: string;
  items: { data: StripeSubscriptionItem[] };
  discounts: StripeDiscount[];
}

export interface StripeSubscriptionPage {
  data: StripeSubscription[];
  hasMore: boolean;
  // Id of the last row Stripe returned, which can differ from the last row in
  // `data` when the lister drops uncounted statuses. Falls back to the last
  // `data` id when omitted (fixture-backed fakes).
  nextCursor?: string;
}

// The seam every pure function in this package is tested against instead of
// a real Stripe client: `createStripeSubscriptionLister` (stripeClient.ts)
// builds the real implementation; provider unit tests substitute a
// fixture-backed fake with the same signature and never touch the network.
// `startingAfter` is the last-seen subscription id, mirroring Stripe's own
// cursor-pagination parameter. Pages carry only MRR-counted statuses (see
// MRR_COUNTED_STATUSES in mrr.ts), which is its sole consumer today.
export type ListActiveSubscriptions = (
  startingAfter?: string,
) => Promise<StripeSubscriptionPage>;

export type StripeActivityKind = StripeEventKind;

// One priced line an activity event touched, already reduced to the product
// it belongs to. `amountCents` is the undiscounted per-billing-cycle amount in
// the currency's smallest unit (not a monthly figure), or null when the price
// has no flat unit amount (tiered/metered).
export interface StripeActivityLine {
  productId: string;
  amountCents: number | null;
}

// A subscription-created / subscription-deleted / invoice-payment-failed
// event, flattened from Stripe's event union. `customerEmail` is only set
// where the event's own object carries one (invoices); subscription events
// carry just `customerId`, resolved separately via StripeDetailSource.
export interface StripeActivityEvent {
  id: string;
  kind: StripeActivityKind;
  // Unix seconds, as Stripe reports it.
  occurredAt: number;
  // The subscription (sub_...) or invoice (in_...) the event is about.
  objectId: string;
  currency: string;
  // The subscription's status at event time; null for invoice events.
  subscriptionStatus: string | null;
  customerId: string | null;
  customerEmail: string | null;
  lines: StripeActivityLine[];
}

export interface StripeActivityPage {
  data: StripeActivityEvent[];
  hasMore: boolean;
  nextCursor?: string;
}

// The seam the Stripe detail logic (activity.ts, provider.ts) is tested
// against instead of a real Stripe client, like ListActiveSubscriptions:
// stripeDetailClient.ts builds the real, network-touching implementation.
export interface StripeDetailSource {
  // Newest first, restricted to the three activity event types.
  listActivityEvents(startingAfter?: string): Promise<StripeActivityPage>;
  getCustomerEmail(customerId: string): Promise<string | null>;
  getProductName(productId: string): Promise<string>;
}
