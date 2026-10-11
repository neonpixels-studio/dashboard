import { readIntegrationEnv } from "../integrationEnv";
import { GITHUB_TOKEN_ENV } from "./repos";

// Null when unset: the GitHub section is "not configured" and the sync skips.
export function readGithubToken(): string | null {
  return readIntegrationEnv(GITHUB_TOKEN_ENV) ?? null;
}
