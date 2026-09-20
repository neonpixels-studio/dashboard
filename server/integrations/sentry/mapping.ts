import type { AppStatus } from "../../../shared/types/dashboard";
import type { SentryIssue } from "./types";

// Sentry's Link response header follows the same cursor-pagination
// convention documented at https://docs.sentry.io/api/pagination/ — one
// entry per rel ("previous"/"next"), each carrying its own results flag:
// `<url>; rel="next"; results="true"; cursor="0:100:0"`. `results="false"`
// still carries a (stale, unusable) cursor value, so it must be checked
// explicitly rather than treating "a cursor is present" as "there's a next
// page".
const NEXT_LINK_PATTERN =
  /<[^>]+>;\s*rel="next";\s*results="(true|false)";\s*cursor="([^"]+)"/;

/**
 * Sentry's issue-search endpoints have no total-count field (paginated by
 * cursor only) — the only way to know how many issues matched a query is to
 * walk every page and sum what each one returns (issueCounts.ts's
 * countAllSentryIssues). This parses the "next" segment out of the raw
 * `Link` header string; returns null when there's no further page, whether
 * because the header is missing entirely or because it reports
 * `results="false"`.
 */
export function parseSentryNextCursor(
  linkHeader: string | null,
): string | null {
  if (!linkHeader) {
    return null;
  }
  const match = NEXT_LINK_PATTERN.exec(linkHeader);
  if (!match) {
    return null;
  }
  const hasNextResults = match[1];
  const cursor = match[2];
  return hasNextResults === "true" ? (cursor ?? null) : null;
}

function hasStringId(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/**
 * Translates one raw Sentry issue (group) object into this package's plain
 * SentryIssue shape. Fails loud on a missing/non-string `id` rather than
 * silently counting a malformed row toward the total — the same "narrow,
 * validated shape over the vendor's raw response" precedent as
 * server/integrations/stripe/mapping.ts's toStripeSubscription.
 */
export function toSentryIssue(raw: unknown): SentryIssue {
  if (!hasStringId(raw)) {
    throw new Error('Sentry issue is missing a string "id" field.');
  }
  return { id: raw.id };
}

// A single unresolved fatal-level issue is always worth immediate attention
// (it's a crash, not a warning), so the danger threshold is fixed at 1 —
// unlike open-issue volume below, this isn't a tunable "how many is too
// many" count.
const FATAL_ISSUE_DANGER_THRESHOLD = 1;
const NO_ISSUES = 0;

/**
 * The status-chip mapping the issue calls out as its core testable unit:
 * open-issue and fatal-issue counts -> a chip label/tone pair. Returns
 * shared/types/dashboard.ts's AppStatus shape (not a bespoke type) so this
 * chip renders through the exact same app/utils/statusColor.ts ->
 * healthToneColor path as every other status chip in the app.
 *
 * The label is deliberately NOT pluralized ("2 FATAL", not "2 FATALS") —
 * "FATAL"/"OPEN" read as the issue-level/category name here, matching the
 * issue's own example ("markpost.io '1 FATAL'"), not as a countable noun
 * (contrast server/utils/dashboardShaping.ts's computeAppStatus, whose
 * "ISSUE"/"ISSUES" genuinely is one).
 *
 * Any unresolved fatal issue outranks open-issue volume: a single
 * crash-level issue is worse than ten warning-level ones, so fatalIssuesCount
 * is checked first and, once past the danger threshold, drives the label on
 * its own (a "3 FATAL, 12 OPEN" combined label is left for a future issue's
 * UI, not invented here).
 *
 * @todo #19 wires this into the read API / PropertyCard.vue's status chip —
 * not called from anywhere yet. It's exported and unit-tested now so that
 * wiring is a pure plumbing change, not new logic.
 */
export function sentryStatusChip(
  openIssuesCount: number,
  fatalIssuesCount: number,
): AppStatus {
  if (fatalIssuesCount >= FATAL_ISSUE_DANGER_THRESHOLD) {
    return { label: `${fatalIssuesCount} FATAL`, tone: "danger" };
  }
  if (openIssuesCount > NO_ISSUES) {
    return { label: `${openIssuesCount} OPEN`, tone: "warn" };
  }
  return { label: "OK", tone: "ok" };
}
