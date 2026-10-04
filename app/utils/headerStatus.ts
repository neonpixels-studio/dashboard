import type { AppStatus } from "#shared/types/dashboard";

export const UNAVAILABLE_STATUS: AppStatus = {
  label: "UNAVAILABLE",
  tone: "danger",
};

// A resolved status always wins. With no status and a failed fetch, the
// header shows an explicit error chip instead of a skeleton that never
// resolves. Note Nuxt resets `data` to its default when a fetch fails, so in
// practice a failed refresh also lands here with no status.
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
