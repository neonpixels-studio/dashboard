import type { IntegrationConfigRow } from "../types";
import { CLERK_VENDOR } from "./types";

const CLERK_DASHBOARD_ORIGIN = "https://dashboard.clerk.com";
// Clerk's dashboard shortcut to the Users page of whichever instance the
// signed-in user last had open. Not app-specific, so it's only the fallback
// for a clerk row with no dashboard ids configured.
const LAST_ACTIVE_USERS_URL = `${CLERK_DASHBOARD_ORIGIN}/~/users`;
// `integration_config.external_id` for a clerk row optionally holds the
// instance's dashboard path ids as `app_xxx/ins_xxx` (copy them out of the
// dashboard URL). The Backend API exposes neither id, so they can't be
// derived from the secret key.
const DASHBOARD_IDS_PATTERN = /^(app_[A-Za-z0-9]+)\/(ins_[A-Za-z0-9]+)$/;

/**
 * Link to the Users page of the app's Clerk dashboard, or null when the app
 * has no enabled Clerk integration at all (nothing to link to).
 */
export function clerkDashboardUsersUrl(
  configRows: IntegrationConfigRow[],
): string | null {
  const clerkRow = configRows.find(
    (row) => row.vendor === CLERK_VENDOR && row.enabled,
  );
  if (!clerkRow) {
    return null;
  }
  const ids = DASHBOARD_IDS_PATTERN.exec(clerkRow.externalId?.trim() ?? "");
  if (!ids) {
    return LAST_ACTIVE_USERS_URL;
  }
  return `${CLERK_DASHBOARD_ORIGIN}/apps/${ids[1]}/instances/${ids[2]}/users`;
}
