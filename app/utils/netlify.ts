const NETLIFY_PROJECTS_URL = "https://app.netlify.com/projects";

// Netlify project names for these properties are the app hostname with dots
// replaced by dashes (https://basin.fm -> basin-fm).
export function netlifyProjectName(appUrl: string): string {
  return new URL(appUrl).hostname.replaceAll(".", "-");
}

export function netlifySettingsUrl(appUrl: string): string {
  return `${NETLIFY_PROJECTS_URL}/${netlifyProjectName(appUrl)}/configuration/general`;
}

export function netlifyLogsUrl(appUrl: string): string {
  return `${NETLIFY_PROJECTS_URL}/${netlifyProjectName(appUrl)}/analytics-and-metrics/observability`;
}
