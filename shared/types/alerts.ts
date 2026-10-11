// One active problem on the "/" overview Alerts panel. Source-agnostic on
// purpose: sync failures and stale vendors are the first producers, and later
// ones (deploys, CI, ...) emit the same shape so the panel never changes.
export interface OverviewAlert {
  // Stable per alert across refreshes; used as the list key.
  id: string;
  // Property slug (see app/config/apps.ts).
  slug: string;
  // What raised it, shown as a label (a sync vendor today, e.g. "stripe").
  source: string;
  // Safe to render as-is: sync errors are redacted at write time.
  message: string;
  // ISO timestamp, or null when the source has no meaningful time.
  occurredAt: string | null;
  // Where the alert is actionable (the property's detail page).
  href: string;
}

// Newest first.
export type OverviewAlertsResponse = OverviewAlert[];
