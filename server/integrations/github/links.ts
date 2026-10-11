import { GITHUB_ORG } from "./repos";

const GITHUB_WEB_URL = "https://github.com";

export function repoUrl(repo: string): string {
  return `${GITHUB_WEB_URL}/${GITHUB_ORG}/${repo}`;
}

export function checksUrl(repo: string, sha: string | null): string {
  if (!sha) {
    return `${repoUrl(repo)}/actions`;
  }
  return `${repoUrl(repo)}/commit/${sha}/checks`;
}

function searchUrl(page: "issues" | "pulls", type: string, repos: string[]) {
  const repoTerms = repos.map((repo) => `repo:${GITHUB_ORG}/${repo}`);
  const query = ["is:open", `is:${type}`, ...repoTerms].join(" ");
  return `${GITHUB_WEB_URL}/${page}?q=${encodeURIComponent(query)}`;
}

// One repo links to its own list; several link to a search spanning them all.
export function openIssuesUrl(repos: string[]): string {
  const [onlyRepo] = repos;
  if (repos.length === 1 && onlyRepo) {
    return `${repoUrl(onlyRepo)}/issues`;
  }
  return searchUrl("issues", "issue", repos);
}

export function openPullsUrl(repos: string[]): string {
  const [onlyRepo] = repos;
  if (repos.length === 1 && onlyRepo) {
    return `${repoUrl(onlyRepo)}/pulls`;
  }
  return searchUrl("pulls", "pr", repos);
}
