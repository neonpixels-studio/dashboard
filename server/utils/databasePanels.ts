import { NEON_VENDOR } from "../../shared/constants/neonPlan";
import type { DatabasePanel } from "../../shared/types/database";
import {
  fetchIntegrationConfigs,
  fetchNeonBranches,
  fetchNeonUsage,
  type DrizzleDb,
} from "./dashboardQueries";
import { buildDatabasePanels } from "./neonUsage";

async function fetchDatabasePanels(
  db: DrizzleDb,
  slugs: string[],
): Promise<DatabasePanel[]> {
  const [usageRows, branchRows] = await Promise.all([
    fetchNeonUsage(db, slugs),
    fetchNeonBranches(db, slugs),
  ]);
  return buildDatabasePanels(usageRows, branchRows);
}

/**
 * The DATABASE panel for each of `slugs` whose Neon integration is enabled and
 * has synced (a slug with neither simply has no panel). A disabled integration
 * leaves its last usage row behind, which must neither show nor alert.
 * Shared by the app detail, overview and alerts endpoints so they agree.
 */
export async function fetchEnabledDatabasePanels(
  db: DrizzleDb,
  slugs: string[],
): Promise<DatabasePanel[]> {
  const configRows = await fetchIntegrationConfigs(db, slugs);
  const enabledSlugs = configRows
    .filter((row) => row.vendor === NEON_VENDOR && row.enabled)
    .map((row) => row.slug);
  return fetchDatabasePanels(db, enabledSlugs);
}
