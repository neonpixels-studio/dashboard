import { reportError, reportErrorCondition } from "../utils/errorReporting";

// A vendor's last success older than this is reported. The scheduled sync
// runs every 15 minutes, so this is ~24 consecutive failed or skipped runs:
// long enough to ride out a vendor incident or a rotation-heavy window, short
// enough that a dead credential doesn't go unnoticed for days. A time bound
// rather than a consecutive-failure count because sync_status keeps no
// failure counter, and a row skipped for hours (stale last success) must
// alert too. Known gaps: an enabled row with no sync_status run recorded at
// all is not judged, and a never-succeeded row alerts as soon as it has run.
export const STALE_VENDOR_THRESHOLD_MS = 6 * 60 * 60 * 1_000;

const MS_PER_HOUR = 60 * 60 * 1_000;

export const STALE_VENDOR_MESSAGE =
  "sync: vendor has had no successful sync within the staleness threshold";

// The columns of sync_status (joined to an enabled integration_config row)
// this check needs.
export interface SyncHealthRow {
  slug: string;
  vendor: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
}

export interface StaleVendor {
  slug: string;
  vendor: string;
  lastSuccessAt: string | null;
  hoursSinceSuccess: number | null;
}

function isStale(row: SyncHealthRow, now: Date, thresholdMs: number): boolean {
  if (row.lastSuccessAt) {
    return now.getTime() - row.lastSuccessAt.getTime() > thresholdMs;
  }
  // Never succeeded: only judgeable once a run has actually been recorded.
  // A row with neither timestamp (e.g. only a rate-limit watermark) is
  // "can't tell", not "stale".
  return row.lastRunAt !== null;
}

function toStaleVendor(row: SyncHealthRow, now: Date): StaleVendor {
  return {
    slug: row.slug,
    vendor: row.vendor,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    hoursSinceSuccess: row.lastSuccessAt
      ? Math.floor((now.getTime() - row.lastSuccessAt.getTime()) / MS_PER_HOUR)
      : null,
  };
}

export function findStaleVendors(
  rows: SyncHealthRow[],
  now: Date,
  thresholdMs: number = STALE_VENDOR_THRESHOLD_MS,
): StaleVendor[] {
  return rows
    .filter((row) => isStale(row, now, thresholdMs))
    .map((row) => toStaleVendor(row, now));
}

export interface StaleVendorAlertDeps {
  listSyncHealthRows: () => Promise<SyncHealthRow[]>;
  now?: () => Date;
}

// Runs after every sync. Monitoring only: a failure here is reported and
// swallowed so it can never fail the sync response that already succeeded.
// One event per stale vendor per sync (~every 15 minutes while stale, so it
// counts against Sentry quota until fixed); the message is static so they group into one
// Sentry issue, with slug/vendor in context (see errorReporting.ts).
export async function alertOnStaleVendors(
  deps: StaleVendorAlertDeps,
): Promise<StaleVendor[]> {
  try {
    const rows = await deps.listSyncHealthRows();
    const now = (deps.now ?? (() => new Date()))();
    const staleVendors = findStaleVendors(rows, now);
    for (const staleVendor of staleVendors) {
      reportErrorCondition(STALE_VENDOR_MESSAGE, { ...staleVendor });
    }
    return staleVendors;
  } catch (error) {
    reportError("sync: stale vendor check failed", error);
    return [];
  }
}
