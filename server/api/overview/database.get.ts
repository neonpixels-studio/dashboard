import { useDb } from "../../db";
import { requireUser } from "../../utils/auth";
import { fetchDatabasePanels } from "../../utils/databasePanels";
import { DASHBOARD_SLUG } from "../../utils/neonUsage";
import type { DatabasePanel } from "../../../shared/types/database";

// The dashboard's own Neon database block for the "/" overview (it has no
// /apps page). Null until its Neon sync has run.
export default defineEventHandler(
  async (event): Promise<DatabasePanel | null> => {
    requireUser(event);

    const [panel] = await fetchDatabasePanels(useDb(), [DASHBOARD_SLUG]);
    return panel ?? null;
  },
);
