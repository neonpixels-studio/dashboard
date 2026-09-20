import type { AppStatus } from "../../../shared/types/dashboard";
import type { SentryIssue } from "./types";

// Sentry's Link response header follows the same cursor-pagination
// convention documented at https://docs.sentry.io/api/pagination/ — one
// entry per rel ("previous"/"next"), each carrying its own results flag:
// `<url>; rel="next"; results="true"; cursor="0:100:0"`. `results="false"`
// still carries a (stale, unusable) cursor value, so it must be checked
// explicitly rather than treating "a cursor is present" as "there's a next
// page". Per that doc, "cursors are provided for both previous and next
// pages, even if there are no results on these pages" — a real Sentry
// response always has a "next" entry, so a header that lacks one entirely,
// or one whose "next" entry is missing `results`/`cursor`, is malformed
// rather than "no more pages" and fails loud below instead of being
// silently read as the end of the list. Splits on a comma immediately
// followed by "<" (not on every comma) so a comma embedded inside one
// entry's own URL/query string can't mis-split the header.
const LINK_ENTRY_SEPARATOR = /,\s*(?=<)/;
const NEXT_REL_PATTERN = /rel="next"/;
const RESULTS_ATTRIBUTE_PATTERN = /results="(true|false)"/;
const CURSOR_ATTRIBUTE_PATTERN = /cursor="([^"]+)"/;

/**
 * Sentry's issue-search endpoints have no DOCUMENTED total-count field
 * (paginated by cursor only, per https://docs.sentry.io/api/pagination/ and
 * the "List a Project's Issues" API reference). An undocumented `X-Hits`
 * header has existed on and off (Sentry has both broken and restored it as
 * an unannounced regression per their own forum), but this provider
 * deliberately doesn't depend on it — an internal dashboard reading an
 * undocumented header that could silently disappear again is a worse
 * failure mode than the extra requests below. The only documented way to
 * know how many issues matched a query is to walk every page and sum what
 * each one returns (issueCounts.ts's countAllSentryIssues). This parses the
 * "next" segment out of the raw
 * `Link` header string; returns null when there's no further page (either
 * the header is missing entirely — no page has been fetched yet to have
 * received one — or the "next" entry reports `results="false"`).
 */
export function parseSentryNextCursor(
  linkHeader: string | null,
): string | null {
  if (!linkHeader) {
    return null;
  }

  const nextEntry = linkHeader
    .split(LINK_ENTRY_SEPARATOR)
    .find((entry) => NEXT_REL_PATTERN.test(entry));
  if (!nextEntry) {
    throw new Error(`Sentry Link header has no "next" entry: "${linkHeader}".`);
  }

  const resultsMatch = RESULTS_ATTRIBUTE_PATTERN.exec(nextEntry);
  const cursorMatch = CURSOR_ATTRIBUTE_PATTERN.exec(nextEntry);
  if (!resultsMatch || !cursorMatch) {
    throw new Error(
      `Sentry Link header's "next" entry is missing results/cursor: "${nextEntry}".`,
    );
  }

  return resultsMatch[1] === "true" ? (cursorMatch[1] ?? null) : null;
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
