// Narrow, validated subset of Neon's project and branch responses.
// mapping.ts is the one place that translates the raw API shape into these;
// the provider and its tests only ever see this file's types. Mirrors
// server/integrations/sentry/types.ts.
export interface NeonProjectUsage {
  // CU-seconds of compute consumed this billing period.
  computeTimeSeconds: number;
  activeTimeSeconds: number;
  // Neon's `synthetic_storage_size` field. Neon documents it as deprecated
  // and possibly 0, so provider.ts falls back to the branches' logical sizes.
  syntheticStorageBytes: number;
  dataTransferBytes: number;
  writtenDataBytes: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface NeonBranchSummary {
  name: string;
  createdAt: Date | null;
  logicalSizeBytes: number;
}

// The seam the provider is tested against instead of a real HTTP call:
// `createNeonClient` (neonClient.ts) builds the real implementation; provider
// tests substitute a fake with the same shape and never touch the network.
export interface NeonClient {
  getProjectUsage(projectId: string): Promise<NeonProjectUsage>;
  listBranches(projectId: string): Promise<NeonBranchSummary[]>;
}
