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

export interface StripeSubscriptionItem {
  id: string;
  quantity: number | null;
  price: StripePrice;
}

export interface StripeSubscription {
  id: string;
  status: string;
  items: { data: StripeSubscriptionItem[] };
}

export interface StripeSubscriptionPage {
  data: StripeSubscription[];
  hasMore: boolean;
}

// The seam every pure function in this package is tested against instead of
// a real Stripe client: `createStripeSubscriptionLister` (stripeClient.ts)
// builds the real implementation; provider unit tests substitute a
// fixture-backed fake with the same signature and never touch the network.
// `startingAfter` is the last-seen subscription id, mirroring Stripe's own
// cursor-pagination parameter.
export type ListActiveSubscriptions = (
  startingAfter?: string,
) => Promise<StripeSubscriptionPage>;
