import { BILLING_CURRENCY, MILLISECONDS_PER_SECOND } from "./mrr";
import type { StripeEventInput } from "../types";
import type {
  StripeActivityEvent,
  StripeActivityLine,
  StripeDetailSource,
} from "./types";

// events.list is newest-first and Stripe only keeps 30 days of events, so
// capping the pages walked only ever trims the OLDEST events from the
// "recent activity" list; it can never hide a newer one.
export const MAX_ACTIVITY_PAGES = 5;
// Stripe only keeps 30 days of events; stored rows older than this are pruned
// because they could never be re-fetched.
const ACTIVITY_LOOKBACK_DAYS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MASK = "••••";
const MASK_FALLBACK_LOCAL_LENGTH = 2;

/** Events older than this are outside Stripe's window and are not shown. */
export function activityCutoff(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - ACTIVITY_LOOKBACK_DAYS * MILLISECONDS_PER_DAY,
  );
}

/**
 * "m••••a@hey.com": first and last character of the local part, domain kept.
 * A local part too short to hide anything behind (1-2 chars) keeps only its
 * first character, so the mask never reveals the whole address.
 */
export function maskEmail(email: string | null): string | null {
  const separatorIndex = email?.lastIndexOf("@") ?? -1;
  if (!email || separatorIndex < 1) {
    return null;
  }
  const local = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex);
  if (local.length <= MASK_FALLBACK_LOCAL_LENGTH) {
    return `${local.charAt(0)}${MASK}${domain}`;
  }
  return `${local.charAt(0)}${MASK}${local.at(-1)}${domain}`;
}

/**
 * Walks events.list newest-first, up to MAX_ACTIVITY_PAGES pages. Stops early
 * when a page is the last or returns no cursor to continue from.
 */
export async function fetchActivityEvents(
  source: StripeDetailSource,
): Promise<StripeActivityEvent[]> {
  const events: StripeActivityEvent[] = [];
  let startingAfter: string | undefined;
  for (let pageIndex = 0; pageIndex < MAX_ACTIVITY_PAGES; pageIndex += 1) {
    const page = await source.listActivityEvents(startingAfter);
    events.push(...page.data);
    startingAfter = page.nextCursor ?? page.data.at(-1)?.id;
    if (!page.hasMore || !startingAfter) {
      break;
    }
  }
  return events;
}

function matchingLines(
  event: StripeActivityEvent,
  productIds: Set<string>,
): StripeActivityLine[] {
  return event.lines.filter((line) => productIds.has(line.productId));
}

function assertBillingCurrency(event: StripeActivityEvent): void {
  if (event.currency === BILLING_CURRENCY) {
    return;
  }
  throw new Error(
    `Stripe event "${event.id}" is in "${event.currency}", but only ` +
      `"${BILLING_CURRENCY}" amounts are supported (no FX conversion).`,
  );
}

function planNameFor(
  lines: StripeActivityLine[],
  planNames: Map<string, string>,
): string {
  const names = lines.map(
    (line) => planNames.get(line.productId) ?? line.productId,
  );
  return [...new Set(names)].join(" + ");
}

// Null when any matching line has no flat amount (tiered/metered pricing), so
// the panel shows a dash instead of a misleading partial or zero total.
function totalAmountCents(lines: StripeActivityLine[]): number | null {
  if (lines.some((line) => line.amountCents === null)) {
    return null;
  }
  return lines.reduce((sum, line) => sum + (line.amountCents ?? 0), 0);
}

// A subscription that never got its first payment (incomplete) isn't a real
// signup and isn't in MRR, so it shouldn't appear as a "new" subscriber.
const NEVER_PAID_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "incomplete",
  "incomplete_expired",
]);

function isNeverPaidSignup(event: StripeActivityEvent): boolean {
  return (
    event.kind === "new" &&
    event.subscriptionStatus !== null &&
    NEVER_PAID_SUBSCRIPTION_STATUSES.has(event.subscriptionStatus)
  );
}

async function resolveEmail(
  event: StripeActivityEvent,
  source: Pick<StripeDetailSource, "getCustomerEmail">,
): Promise<string | null> {
  if (event.customerEmail) {
    return event.customerEmail;
  }
  if (!event.customerId) {
    return null;
  }
  return source.getCustomerEmail(event.customerId);
}

async function toEventRow(
  event: StripeActivityEvent,
  lines: StripeActivityLine[],
  planNames: Map<string, string>,
  source: Pick<StripeDetailSource, "getCustomerEmail">,
): Promise<StripeEventInput> {
  assertBillingCurrency(event);
  return {
    eventId: event.id,
    kind: event.kind,
    occurredAt: new Date(event.occurredAt * MILLISECONDS_PER_SECOND),
    emailMasked: maskEmail(await resolveEmail(event, source)),
    planName: planNameFor(lines, planNames),
    amountCents: totalAmountCents(lines),
    objectId: event.objectId,
  };
}

/**
 * Keeps only the events that touch `productIds` (the Stripe account is shared
 * across apps) and shapes them into stripe_event rows with the customer email
 * masked. Customer lookups happen only for matching subscription events, one
 * at a time (they are memoized per customer) so a busy account can't burst
 * Stripe's rate limit.
 */
export async function buildEventRows(
  events: StripeActivityEvent[],
  productIds: Set<string>,
  planNames: Map<string, string>,
  source: Pick<StripeDetailSource, "getCustomerEmail">,
): Promise<StripeEventInput[]> {
  const rows: StripeEventInput[] = [];
  for (const event of events) {
    const lines = matchingLines(event, productIds);
    if (!lines.length || isNeverPaidSignup(event)) {
      continue;
    }
    rows.push(await toEventRow(event, lines, planNames, source));
  }
  return rows;
}
