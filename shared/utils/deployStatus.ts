import type { DeployStatus } from "../types/dashboard";

const NETLIFY_STATE_READY = "ready";
const NETLIFY_STATE_ERROR = "error";

// Netlify reports ~15 deploy states (building, uploading, retrying, ...). Only
// `ready` and `error` are terminal outcomes the dashboard judges; everything
// else is still moving, so it is "in progress" and never alerts.
export function deployStatusForState(state: string): DeployStatus {
  if (state === NETLIFY_STATE_READY) {
    return "success";
  }
  if (state === NETLIFY_STATE_ERROR) {
    return "failed";
  }
  return "in_progress";
}
