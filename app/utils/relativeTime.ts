// Compact "synced Xm/Xh/Xd ago" formatting used by the error/stale-data
// states so a failed fetch can still tell the user when the numbers on
// screen were last real, instead of silently showing zeros. Matches the
// existing compact style used across the design (e.g. AppDetailProduct's
// "SYNCED 2M AGO" panel meta).

const MINUTE_IN_MS = 60_000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

export function formatRelativeTime(
  isoTimestamp: string | null,
  now: Date = new Date(),
): string {
  if (!isoTimestamp) {
    return "never synced";
  }

  const elapsedMs = now.getTime() - new Date(isoTimestamp).getTime();
  if (Number.isNaN(elapsedMs)) {
    return "sync time unknown";
  }
  if (elapsedMs < MINUTE_IN_MS) {
    // Covers both "just synced" and a clock-skewed timestamp slightly in
    // the future — either way it's too recent to report a unit.
    return "just now";
  }
  if (elapsedMs < HOUR_IN_MS) {
    return `${Math.floor(elapsedMs / MINUTE_IN_MS)}m ago`;
  }
  if (elapsedMs < DAY_IN_MS) {
    return `${Math.floor(elapsedMs / HOUR_IN_MS)}h ago`;
  }
  return `${Math.floor(elapsedMs / DAY_IN_MS)}d ago`;
}
