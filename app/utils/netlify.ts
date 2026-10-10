const NETLIFY_PROJECTS_URL = "https://app.netlify.com/projects";
const SETTINGS_PATH = "configuration/general";
const LOGS_PATH = "analytics-and-metrics/observability";

// Netlify project names for these properties are the app hostname with dots
// replaced by dashes (https://basin.fm -> basin-fm).
export function netlifyProjectName(appUrl: string): string {
  return new URL(appUrl).hostname.replaceAll(".", "-");
}

export function netlifySettingsUrl(appUrl: string): string {
  return `${NETLIFY_PROJECTS_URL}/${netlifyProjectName(appUrl)}/${SETTINGS_PATH}`;
}

export function netlifyLogsUrl(appUrl: string): string {
  return `${NETLIFY_PROJECTS_URL}/${netlifyProjectName(appUrl)}/${LOGS_PATH}`;
}
