import { deployStatusForState } from "../../../shared/utils/deployStatus";
import type { NetlifyDeploy } from "./types";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Maps one raw Netlify deploy object. Throws on a malformed shape so a changed
// API fails the sync loudly instead of storing a half-empty deploy.
export function toNetlifyDeploy(raw: unknown): NetlifyDeploy {
  const deploy = (raw ?? {}) as Record<string, unknown>;
  if (typeof deploy.id !== "string" || typeof deploy.state !== "string") {
    throw new Error("Netlify deploy is missing a string id or state.");
  }
  const inProgress = deployStatusForState(deploy.state) === "in_progress";
  // `published_at` is only set for deploys that went live; a failed deploy
  // only has `updated_at`.
  const finishedAt = inProgress
    ? null
    : (parseDate(deploy.published_at) ?? parseDate(deploy.updated_at));
  return { id: deploy.id, state: deploy.state, finishedAt };
}
