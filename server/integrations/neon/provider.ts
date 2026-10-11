import { NEON_VENDOR } from "../../../shared/constants/neonPlan";
import { readIntegrationEnv } from "../integrationEnv";
import { NO_DEADLINE } from "../types";
import type {
  FetchDeadline,
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createNeonClient } from "./neonClient";
import type { NeonBranchSummary, NeonClient, NeonProjectUsage } from "./types";

const NEON_API_KEY_ENV_VAR = "NUXT_NEON_API_KEY";

// A "not configured" sync is skipped, not failed: the orchestrator records the
// run without raising a sync-failed alert, so enabling the rows before the
// maintainer has added the key or the project ids is quiet rather than noisy.
const NOT_CONFIGURED_RESULT: ProviderResult = {
  metrics: [],
  trafficBreakdown: [],
  syndicationPosts: [],
  skipped: true,
};

/**
 * The Neon project id for a property: the integration_config row's
 * `external_id` wins, else the deploy-time default
 * `NUXT_NEON_PROJECT_ID_<SLUG>` (same precedence as Sentry's
 * resolveProjectSlug and GA4's resolvePropertyId).
 */
export function resolveNeonProjectId(config: IntegrationConfig): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const fromEnv = readIntegrationEnv(
    `NUXT_NEON_PROJECT_ID_${config.slug.toUpperCase()}`,
  )?.trim();
  return fromEnv || null;
}

function resolveApiKey(config: IntegrationConfig): string | null {
  return config.secret || readIntegrationEnv(NEON_API_KEY_ENV_VAR) || null;
}

// `synthetic_storage_size` is documented as deprecated and may read 0; the
// branches' logical sizes are the documented live figure. The largest one, not
// the sum: a child branch's logical size includes the data it shares with its
// parent, so summing would count the same bytes once per branch.
function resolveStorageBytes(
  usage: NeonProjectUsage,
  branches: NeonBranchSummary[],
): number {
  if (usage.syntheticStorageBytes > 0) {
    return usage.syntheticStorageBytes;
  }
  return Math.max(0, ...branches.map((branch) => branch.logicalSizeBytes));
}

/**
 * Core fetch logic, decoupled from the real HTTP client so it is unit tested
 * against a fake `NeonClient`. A failing Neon call propagates as a thrown
 * error (a failed sync_status row), never a zeroed usage record.
 */
export async function fetchNeonDatabase(
  config: IntegrationConfig,
  client: NeonClient,
  capturedAt: Date = new Date(),
): Promise<ProviderResult> {
  const projectId = resolveNeonProjectId(config);
  if (!projectId) {
    return NOT_CONFIGURED_RESULT;
  }

  const [usage, branches] = await Promise.all([
    client.getProjectUsage(projectId),
    client.listBranches(projectId),
  ]);

  return {
    metrics: [],
    trafficBreakdown: [],
    syndicationPosts: [],
    neonDatabase: {
      usage: {
        computeTimeSeconds: usage.computeTimeSeconds,
        activeTimeSeconds: usage.activeTimeSeconds,
        storageBytes: resolveStorageBytes(usage, branches),
        dataTransferBytes: usage.dataTransferBytes,
        writtenDataBytes: usage.writtenDataBytes,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        capturedAt,
      },
      branches: branches.map((branch) => ({
        name: branch.name,
        createdAt: branch.createdAt,
      })),
    },
  };
}

export const neonProvider: IntegrationProvider = {
  vendor: NEON_VENDOR,
  async fetch(
    config: IntegrationConfig,
    deadline: FetchDeadline = NO_DEADLINE,
  ): Promise<ProviderResult> {
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      return NOT_CONFIGURED_RESULT;
    }
    return fetchNeonDatabase(
      config,
      createNeonClient(apiKey, undefined, deadline),
    );
  },
};
