import {
  BYTES_PER_GIB,
  NEON_ALERT_THRESHOLD_RATIO,
} from "#shared/constants/neonPlan";
import type { DatabasePanel as DatabasePanelData } from "#shared/types/database";
import { formatAlertTime } from "~/utils/alertFormat";
import { formatSyncedDate } from "~/utils/rollupFormat";

const BYTES_PER_MIB = 1_024 ** 2;
const PERCENT = 100;
const CU_HOURS_DECIMALS = 1;
const GIB_DECIMALS = 2;

export function formatCuHours(cuHours: number): string {
  return `${cuHours.toFixed(CU_HOURS_DECIMALS)} CU-hours`;
}

// MB below a gibibyte, GB at or above, matching how the Neon console labels
// storage.
export function formatDatabaseBytes(bytes: number): string {
  if (bytes >= BYTES_PER_GIB) {
    return `${(bytes / BYTES_PER_GIB).toFixed(GIB_DECIMALS)} GB`;
  }
  return `${Math.round(bytes / BYTES_PER_MIB)} MB`;
}

export function shareOfAllowance(used: number, allowance: number): number {
  if (allowance <= 0) {
    return 0;
  }
  return used / allowance;
}

// Bar fill width: clamped so an over-allowance reading still draws a full
// bar rather than overflowing the track.
export function meterPct(used: number, allowance: number): number {
  const pct = Math.round(shareOfAllowance(used, allowance) * PERCENT);
  return Math.min(PERCENT, Math.max(0, pct));
}

export function formatSharePct(share: number): string {
  return `${Math.round(share * PERCENT)}%`;
}

// Same threshold the server alerts on, so a bar turns red exactly when the
// matching alert is raised.
export function meterColor(share: number): string {
  return share >= NEON_ALERT_THRESHOLD_RATIO ? "var(--err)" : "var(--ok)";
}

export interface DatabasePanelView {
  computeValue: string;
  computePct: number;
  computeShareLabel: string;
  computeColor: string;
  projectionLabel: string;
  storageValue: string;
  storagePct: number;
  storageShareLabel: string;
  storageColor: string;
  transferLabel: string;
  // "10 OCT 2026 · 12:00 UTC": when the figures were last synced, so a stale
  // sync is visible. Null for an unparseable timestamp.
  syncedLabel: string | null;
  branches: {
    name: string;
    createdAt: string | null;
    dateLabel: string | null;
  }[];
}

const NO_PROJECTION_LABEL = "Not enough data yet";

function projectionLabelFor(
  projectedCuHours: number | null,
  allowanceCuHours: number,
): string {
  if (projectedCuHours === null) {
    return NO_PROJECTION_LABEL;
  }
  const share = shareOfAllowance(projectedCuHours, allowanceCuHours);
  return `${formatCuHours(projectedCuHours)} (${formatSharePct(share)})`;
}

/**
 * Everything the DATABASE panel prints, as plain strings and numbers. The bar
 * colour follows the projection when there is one (the figure the server
 * alerts on), else the usage so far.
 */
export function toDatabasePanelView(
  panel: DatabasePanelData,
): DatabasePanelView {
  const { compute, storage } = panel;
  const computeShare = shareOfAllowance(
    compute.usedCuHours,
    compute.allowanceCuHours,
  );
  const storageShare = shareOfAllowance(
    storage.usedBytes,
    storage.allowanceBytes,
  );
  const judgedComputeCuHours = compute.projectedCuHours ?? compute.usedCuHours;
  return {
    computeValue: `${formatCuHours(compute.usedCuHours)} of ${formatCuHours(compute.allowanceCuHours)}`,
    computePct: meterPct(compute.usedCuHours, compute.allowanceCuHours),
    computeShareLabel: formatSharePct(computeShare),
    computeColor: meterColor(
      shareOfAllowance(judgedComputeCuHours, compute.allowanceCuHours),
    ),
    projectionLabel: projectionLabelFor(
      compute.projectedCuHours,
      compute.allowanceCuHours,
    ),
    storageValue: `${formatDatabaseBytes(storage.usedBytes)} of ${formatDatabaseBytes(storage.allowanceBytes)}`,
    storagePct: meterPct(storage.usedBytes, storage.allowanceBytes),
    storageShareLabel: formatSharePct(storageShare),
    storageColor: meterColor(storageShare),
    transferLabel: formatDatabaseBytes(panel.dataTransferBytes),
    syncedLabel: formatAlertTime(panel.capturedAt),
    branches: panel.branches.map((branch) => ({
      name: branch.name,
      createdAt: branch.createdAt,
      dateLabel: branch.createdAt ? formatSyncedDate(branch.createdAt) : null,
    })),
  };
}
