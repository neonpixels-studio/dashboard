import type { AppDeploy, AppDeployStatus } from "#shared/types/dashboard";
import { formatAlertTime } from "~/utils/alertFormat";
import { netlifyDeployUrl } from "~/utils/netlify";
import { formatRelativeTime } from "~/utils/relativeTime";

type DeployTileTone = "ok" | "warn" | "danger";

export interface DeployTileData {
  value: string;
  tone: DeployTileTone | undefined;
  // Relative finish time, or an explanatory line when there's no time.
  sub: string;
  // Full timestamp for the hover title; null when there's no finish time.
  fullTime: string | null;
  finishedAt: string | null;
  // The deploy in Netlify; null when there's no deploy to link to.
  href: string | null;
}

const VALUE_BY_STATUS: Record<AppDeployStatus, string> = {
  success: "SUCCESS",
  failed: "FAILED",
  in_progress: "IN PROGRESS",
  none: "NO DEPLOYS",
  not_configured: "NOT CONFIGURED",
};

const TONE_BY_STATUS: Record<AppDeployStatus, DeployTileTone | undefined> = {
  success: "ok",
  failed: "danger",
  in_progress: "warn",
  none: undefined,
  not_configured: undefined,
};

const SUB_WITHOUT_TIME: Partial<Record<AppDeployStatus, string>> = {
  in_progress: "Build running",
  none: "No production deploy synced yet",
  not_configured: "Set NUXT_NETLIFY_TOKEN to enable",
};

function relativeFinishTime(
  finishedAt: string | null,
  status: AppDeployStatus,
  now: Date,
): string {
  if (finishedAt) {
    return formatRelativeTime(finishedAt, now);
  }
  return SUB_WITHOUT_TIME[status] ?? "Finish time unknown";
}

export function buildDeployTileData(
  deploy: AppDeploy,
  appUrl: string,
  now: Date = new Date(),
): DeployTileData {
  const { status, finishedAt, deployId } = deploy;
  return {
    value: VALUE_BY_STATUS[status],
    tone: TONE_BY_STATUS[status],
    sub: relativeFinishTime(finishedAt, status, now),
    fullTime: formatAlertTime(finishedAt),
    finishedAt,
    href: deployId ? netlifyDeployUrl(appUrl, deployId) : null,
  };
}
