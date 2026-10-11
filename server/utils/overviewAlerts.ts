import { findAppBySlug } from "../../app/config/apps";
import { netlifyDeployUrl } from "../../app/utils/netlify";
import type { OverviewAlert } from "../../shared/types/alerts";
import { deployStatusForState } from "../../shared/utils/deployStatus";
import type { DeployStatusRow } from "./dashboardQueries";
import {
  findStaleVendors,
  type StaleVendor,
  type SyncAlertRow,
} from "../integrations/staleVendorAlert";

const FAILED_SYNC_FALLBACK_MESSAGE = "Sync failed";
const NEVER_SUCCEEDED_MESSAGE = "No successful sync yet";
const NETLIFY_SOURCE = "netlify";
const FAILED_DEPLOY_MESSAGE = "Production deploy failed";

function alertId(kind: string, row: { slug: string; vendor: string }): string {
  return `${kind}:${row.slug}:${row.vendor}`;
}

function propertyHref(slug: string): string {
  return `/apps/${slug}`;
}

// A row with no recorded run (e.g. only a rate-limit watermark, which leaves
// ok at its false default) is "can't tell", not failing; same rule as
// findStaleVendors.
function isFailing(row: SyncAlertRow): boolean {
  return !row.ok && row.lastRunAt !== null;
}

function toFailedSyncAlert(row: SyncAlertRow): OverviewAlert {
  const occurredAt = row.lastAttemptedAt ?? row.lastRunAt;
  return {
    id: alertId("sync-failed", row),
    slug: row.slug,
    source: row.vendor,
    message: row.error ?? FAILED_SYNC_FALLBACK_MESSAGE,
    occurredAt: occurredAt?.toISOString() ?? null,
    href: propertyHref(row.slug),
  };
}

function staleMessage(staleVendor: StaleVendor): string {
  if (staleVendor.hoursSinceSuccess === null) {
    return NEVER_SUCCEEDED_MESSAGE;
  }
  return `No successful sync in ${staleVendor.hoursSinceSuccess}h`;
}

function toStaleVendorAlert(staleVendor: StaleVendor): OverviewAlert {
  return {
    id: alertId("sync-stale", staleVendor),
    slug: staleVendor.slug,
    source: staleVendor.vendor,
    message: staleMessage(staleVendor),
    // Last good sync, not last run: lastRunAt advances every tick.
    occurredAt: staleVendor.lastSuccessAt,
    href: propertyHref(staleVendor.slug),
  };
}

function byNewestFirst(a: OverviewAlert, b: OverviewAlert): number {
  if (a.occurredAt === b.occurredAt) {
    return 0;
  }
  if (a.occurredAt === null) {
    return 1;
  }
  if (b.occurredAt === null) {
    return -1;
  }
  return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
}

function toFailedDeployAlert(row: DeployStatusRow): OverviewAlert | null {
  const app = findAppBySlug(row.slug);
  if (!app || deployStatusForState(row.state) !== "failed") {
    return null;
  }
  return {
    id: `deploy-failed:${row.slug}`,
    slug: row.slug,
    source: NETLIFY_SOURCE,
    message: FAILED_DEPLOY_MESSAGE,
    occurredAt: row.finishedAt?.toISOString() ?? null,
    href: netlifyDeployUrl(app.url, row.deployId),
  };
}

// Only the latest production deploy is stored per property, so a failed one
// clears the moment a newer deploy (in progress or succeeded) is synced over
// it. In-progress and successful deploys never alert.
export function buildDeployAlerts(rows: DeployStatusRow[]): OverviewAlert[] {
  return rows
    .map(toFailedDeployAlert)
    .filter((alert): alert is OverviewAlert => alert !== null);
}

export function buildOverviewAlerts(
  syncRows: SyncAlertRow[],
  deployRows: DeployStatusRow[],
  now: Date,
): OverviewAlert[] {
  return [
    ...buildSyncAlerts(syncRows, now),
    ...buildDeployAlerts(deployRows),
  ].sort(byNewestFirst);
}

// Failing rows plus stale vendors (via findStaleVendors, so the rule stays in
// one place). A vendor that is both shows once, as the failing alert since it
// carries the actual error.
export function buildSyncAlerts(
  rows: SyncAlertRow[],
  now: Date,
): OverviewAlert[] {
  const failingRows = rows.filter(isFailing);
  const failingKeys = new Set(failingRows.map((row) => alertId("vendor", row)));
  const staleAlerts = findStaleVendors(rows, now)
    .filter((staleVendor) => !failingKeys.has(alertId("vendor", staleVendor)))
    .map(toStaleVendorAlert);
  return [...failingRows.map(toFailedSyncAlert), ...staleAlerts].sort(
    byNewestFirst,
  );
}
