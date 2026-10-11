import { formatSyncedDate } from "~/utils/rollupFormat";

// "10 OCT 2026 · 14:05 UTC". Absolute rather than "Xm ago" so SSR and the
// client render the same text. Null for a missing or unparseable timestamp.
export function formatAlertTime(isoTimestamp: string | null): string | null {
  if (!isoTimestamp) {
    return null;
  }
  const day = formatSyncedDate(isoTimestamp);
  if (!day) {
    return null;
  }
  const time = new Date(isoTimestamp).toISOString().slice(11, 16);
  return `${day} · ${time} UTC`;
}
