// Pure shaping for the DATABASE panel and its alerts: Neon usage rows in,
// DatabasePanel / OverviewAlert out. No db access, so the projection math and
// the alert rules are unit tested directly (tests/server/utils/neonUsage.test.ts).
import {
  BYTES_PER_GIB,
  NEON_ALERT_THRESHOLD_RATIO,
  NEON_EXPECTED_BRANCH_NAMES,
  NEON_FREE_PLAN_COMPUTE_CU_HOURS,
  NEON_FREE_PLAN_STORAGE_BYTES,
  NEON_MIN_PROJECTION_ELAPSED_MS,
  NEON_VENDOR,
  SECONDS_PER_HOUR,
} from "../../shared/constants/neonPlan";
import type { OverviewAlert } from "../../shared/types/alerts";
import type { DatabaseAlert, DatabasePanel } from "../../shared/types/database";
import type { NeonBranchRow, NeonUsageRow } from "./dashboardQueries";

const PERCENT = 100;
// The dashboard has no /apps page, so its alerts link to the overview block.
const OVERVIEW_DATABASE_HREF = "/#database";
export const DASHBOARD_SLUG = "dashboard";

export function cuHoursFromSeconds(computeTimeSeconds: number): number {
  return computeTimeSeconds / SECONDS_PER_HOUR;
}

interface ProjectionInput {
  usedCuHours: number;
  periodStart: Date;
  periodEnd: Date;
  // When `usedCuHours` was measured: the sync time, not "now", so a stale
  // sync does not inflate the elapsed share of the period.
  capturedAt: Date;
}

/**
 * Linear end-of-period estimate: usage so far scaled by (period length /
 * elapsed). Null when too little of the period has passed to extrapolate
 * (see NEON_MIN_PROJECTION_ELAPSED_MS) or the period bounds are unusable. At
 * or past the period end the measured usage is the final figure.
 */
export function projectComputeCuHours(input: ProjectionInput): number | null {
  const periodMs = input.periodEnd.getTime() - input.periodStart.getTime();
  const elapsedMs = input.capturedAt.getTime() - input.periodStart.getTime();
  if (periodMs <= 0 || elapsedMs < NEON_MIN_PROJECTION_ELAPSED_MS) {
    return null;
  }
  if (elapsedMs >= periodMs) {
    return input.usedCuHours;
  }
  return (input.usedCuHours * periodMs) / elapsedMs;
}

export function findUnexpectedBranchNames(branchNames: string[]): string[] {
  return branchNames.filter(
    (name) => !NEON_EXPECTED_BRANCH_NAMES.includes(name),
  );
}

function isAtAlertThreshold(amount: number, allowance: number): boolean {
  return amount / allowance >= NEON_ALERT_THRESHOLD_RATIO;
}

function percentOf(amount: number, allowance: number): number {
  return Math.round((amount / allowance) * PERCENT);
}

function computeAlert(
  usedCuHours: number,
  projectedCuHours: number | null,
): DatabaseAlert | null {
  // Projection is never below usage so far, so it is the figure to judge
  // whenever one exists.
  const judged = projectedCuHours ?? usedCuHours;
  if (!isAtAlertThreshold(judged, NEON_FREE_PLAN_COMPUTE_CU_HOURS)) {
    return null;
  }
  const label = projectedCuHours === null ? "Used" : "Projected";
  return {
    id: "compute",
    message: `${label} ${Math.round(judged)} of ${NEON_FREE_PLAN_COMPUTE_CU_HOURS} CU-hours (${percentOf(judged, NEON_FREE_PLAN_COMPUTE_CU_HOURS)}% of the free-plan allowance)`,
  };
}

function storageAlert(storageBytes: number): DatabaseAlert | null {
  if (!isAtAlertThreshold(storageBytes, NEON_FREE_PLAN_STORAGE_BYTES)) {
    return null;
  }
  return {
    id: "storage",
    message: `Storage at ${percentOf(storageBytes, NEON_FREE_PLAN_STORAGE_BYTES)}% of the ${NEON_FREE_PLAN_STORAGE_BYTES / BYTES_PER_GIB} GB free-plan allowance`,
  };
}

function branchAlert(branchNames: string[]): DatabaseAlert | null {
  const unexpected = findUnexpectedBranchNames(branchNames);
  if (!unexpected.length) {
    return null;
  }
  return {
    id: "branches",
    message: `Unexpected branch${unexpected.length === 1 ? "" : "es"}: ${unexpected.join(", ")}`,
  };
}

function isAlert(alert: DatabaseAlert | null): alert is DatabaseAlert {
  return alert !== null;
}

export function buildDatabasePanel(
  usage: NeonUsageRow,
  branches: NeonBranchRow[],
): DatabasePanel {
  const usedCuHours = cuHoursFromSeconds(usage.computeTimeSeconds);
  const projectedCuHours = projectComputeCuHours({
    usedCuHours,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    capturedAt: usage.capturedAt,
  });
  const alerts = [
    computeAlert(usedCuHours, projectedCuHours),
    storageAlert(usage.storageBytes),
    branchAlert(branches.map((branch) => branch.name)),
  ].filter(isAlert);

  return {
    slug: usage.slug,
    capturedAt: usage.capturedAt.toISOString(),
    periodStart: usage.periodStart.toISOString(),
    periodEnd: usage.periodEnd.toISOString(),
    compute: {
      usedCuHours,
      allowanceCuHours: NEON_FREE_PLAN_COMPUTE_CU_HOURS,
      projectedCuHours,
    },
    storage: {
      usedBytes: usage.storageBytes,
      allowanceBytes: NEON_FREE_PLAN_STORAGE_BYTES,
    },
    dataTransferBytes: usage.dataTransferBytes,
    branches: branches
      .map((branch) => ({
        name: branch.name,
        createdAt: branch.createdAt?.toISOString() ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    alerts,
  };
}

function hrefFor(slug: string): string {
  return slug === DASHBOARD_SLUG ? OVERVIEW_DATABASE_HREF : `/apps/${slug}`;
}

/** Overview Alerts-panel rows for every alert on the given database panels. */
export function buildNeonOverviewAlerts(
  panels: DatabasePanel[],
): OverviewAlert[] {
  return panels.flatMap((panel) =>
    panel.alerts.map((alert) => ({
      id: `neon-${alert.id}:${panel.slug}`,
      slug: panel.slug,
      source: NEON_VENDOR,
      message: alert.message,
      occurredAt: panel.capturedAt,
      href: hrefFor(panel.slug),
    })),
  );
}

/** One panel per usage row, each with its own slug's branches. */
export function buildDatabasePanels(
  usageRows: NeonUsageRow[],
  branchRows: NeonBranchRow[],
): DatabasePanel[] {
  return usageRows.map((usage) =>
    buildDatabasePanel(
      usage,
      branchRows.filter((branch) => branch.slug === usage.slug),
    ),
  );
}
