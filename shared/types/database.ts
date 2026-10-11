// The DATABASE panel's contract (property detail page + the dashboard's own
// block on the overview). Built server-side from the neon_usage and
// neon_branch tables so the projection math and the 80% rule live in one
// place; the panel only renders what it is handed.

export interface DatabaseAlert {
  // Stable per alert kind within a panel; used as the list key.
  id: string;
  message: string;
}

export interface DatabaseBranch {
  name: string;
  // ISO timestamp, or null when Neon reported none.
  createdAt: string | null;
}

export interface DatabaseComputeMeter {
  usedCuHours: number;
  allowanceCuHours: number;
  // End-of-period estimate from usage so far; null until enough of the period
  // has elapsed to extrapolate honestly.
  projectedCuHours: number | null;
  // True when the stored billing period has already ended (the sync that would
  // replace it has not landed): the figures are last period's, so the panel
  // neither colours nor projects from them.
  periodEnded: boolean;
}

export interface DatabaseStorageMeter {
  usedBytes: number;
  allowanceBytes: number;
}

export interface DatabasePanel {
  slug: string;
  // When the usage numbers were last synced from Neon.
  capturedAt: string;
  periodStart: string;
  periodEnd: string;
  compute: DatabaseComputeMeter;
  storage: DatabaseStorageMeter;
  dataTransferBytes: number;
  branches: DatabaseBranch[];
  alerts: DatabaseAlert[];
}
