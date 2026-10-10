import type { DashboardApp } from "~/config/apps";
import { netlifyLogsUrl, netlifySettingsUrl } from "~/utils/netlify";

export interface HeaderLink {
  label: string;
  href: string;
}

// Logs and Settings apply to every property (all are on Netlify); Posts is
// specific to the writing template.
export function buildHeaderLinks(
  app: Pick<DashboardApp, "url" | "template">,
): HeaderLink[] {
  const links: HeaderLink[] = [
    { label: "Logs", href: netlifyLogsUrl(app.url) },
    { label: "Settings", href: netlifySettingsUrl(app.url) },
  ];
  if (app.template === "writing") {
    links.push({ label: "Posts", href: new URL("/posts/", app.url).href });
  }
  return links;
}
