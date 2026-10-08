import type { AppStatus } from "#shared/types/dashboard";

export const UNAVAILABLE_STATUS: AppStatus = {
  label: "UNAVAILABLE",
  tone: "danger",
};

// A resolved status always wins. With no status and a failed fetch, the
// header shows an explicit error chip instead of a skeleton that never
// resolves. useApp keeps the last good data on a failed refresh, so this only
// applies when the very first fetch fails. With last good data kept, the chip
// intentionally keeps its last known status; the body carries the stale warning.
export function resolveHeaderStatus(
  status: AppStatus | null | undefined,
  error: unknown,
): AppStatus | null {
  if (status) {
    return status;
  }
  if (error) {
    return UNAVAILABLE_STATUS;
  }
  return null;
}
