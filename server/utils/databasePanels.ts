import type { DatabasePanel } from "../../shared/types/database";
import {
  fetchNeonBranches,
  fetchNeonUsage,
  type DrizzleDb,
} from "./dashboardQueries";
import { buildDatabasePanels } from "./neonUsage";

/**
 * The DATABASE panel for each slug that has synced Neon usage (a slug with
 * none simply has no panel). Shared by the app detail, overview and alerts
 * endpoints so they always agree.
 */
export async function fetchDatabasePanels(
  db: DrizzleDb,
  slugs: string[],
): Promise<DatabasePanel[]> {
  const [usageRows, branchRows] = await Promise.all([
    fetchNeonUsage(db, slugs),
    fetchNeonBranches(db, slugs),
  ]);
  return buildDatabasePanels(usageRows, branchRows);
}
