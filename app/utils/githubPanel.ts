// View models for the GitHub section of a property page (issue #119): turns
// GithubDetail into tile data. Pure formatting, no Vue, so it's unit-tested
// without mounting anything. A repo that hasn't synced yet contributes
// nothing to a total rather than a fabricated zero.
import type {
  GithubCiState,
  GithubDetail,
  GithubRepoSummary,
} from "#shared/types/dashboard";
import { combineCiStates } from "#shared/utils/githubCi";
import { formatCount, formatOrDash, NO_VALUE_LABEL } from "./rollupFormat";

export type GithubTileTone = "ok" | "warn" | "danger";

export interface GithubTileData {
  key: "issues" | "prs" | "ci";
  label: string;
  value: string;
  sub: string;
  href: string;
  tone?: GithubTileTone;
}

export interface GithubCiRepoRow {
  repo: string;
  label: string;
  href: string;
  tone: GithubTileTone | null;
}

const CI_VALUE_LABELS: Record<GithubCiState, string> = {
  passing: "PASSING",
  failing: "FAILING",
  pending: "PENDING",
  none: "NO CI",
};

const CI_TONES: Record<GithubCiState, GithubTileTone | null> = {
  passing: "ok",
  failing: "danger",
  pending: "warn",
  none: null,
};

function ciValueLabel(state: GithubCiState | null): string {
  return state ? CI_VALUE_LABELS[state] : NO_VALUE_LABEL;
}

function ciTone(state: GithubCiState | null): GithubTileTone | null {
  return state ? CI_TONES[state] : null;
}

function syncedRepos(repos: GithubRepoSummary[]): GithubRepoSummary[] {
  return repos.filter((repo) => repo.synced);
}

function sumCounts(counts: (number | null)[]): number | null {
  const present = counts.filter((count) => count !== null);
  if (present.length === 0) {
    return null;
  }
  return present.reduce((total, count) => total + count, 0);
}

// "OPEN · basin", "OPEN · 2 REPOS", or how many of the repos have synced.
function scopeLabel(repos: GithubRepoSummary[]): string {
  const [onlyRepo] = repos;
  if (repos.length === 1 && onlyRepo) {
    return `OPEN · ${onlyRepo.repo}`;
  }
  const synced = syncedRepos(repos).length;
  if (synced < repos.length) {
    return `OPEN · ${synced} OF ${repos.length} REPOS SYNCED`;
  }
  return `OPEN · ${repos.length} REPOS`;
}

function countTile(
  key: "issues" | "prs",
  label: string,
  count: number | null,
  github: GithubDetail,
): GithubTileData {
  return {
    key,
    label,
    value: formatOrDash(count, formatCount),
    sub: count === null ? "Not synced yet" : scopeLabel(github.repos),
    href: key === "issues" ? github.issuesUrl : github.pullsUrl,
  };
}

function ciSubLabel(
  repos: GithubRepoSummary[],
  state: GithubCiState | null,
): string {
  if (!state) {
    return "Not synced yet";
  }
  const synced = syncedRepos(repos).length;
  if (synced < repos.length) {
    return `MAIN · ${synced} OF ${repos.length} REPOS SYNCED`;
  }
  return "LATEST COMMIT ON MAIN";
}

function ciTile(github: GithubDetail): GithubTileData {
  const state = combineCiStates(github.repos.map((repo) => repo.ciState));
  // Links the repo that decided the rolled-up state (the failing one), so a
  // red tile lands on the red checks; the first repo otherwise.
  const linkedRepo =
    github.repos.find((repo) => repo.ciState === state) ?? github.repos[0];
  return {
    key: "ci",
    label: "CI (MAIN)",
    value: ciValueLabel(state),
    sub: ciSubLabel(github.repos, state),
    href: linkedRepo?.ciUrl ?? "",
    tone: ciTone(state) ?? undefined,
  };
}

export function buildGithubTiles(github: GithubDetail): GithubTileData[] {
  const issues = sumCounts(github.repos.map((repo) => repo.openIssues));
  const prs = sumCounts(github.repos.map((repo) => repo.openPrs));
  return [
    countTile("issues", "ISSUES", issues, github),
    countTile("prs", "PRS", prs, github),
    ciTile(github),
  ];
}

// Per-repo CI links, only worth showing when several repos roll into one tile
// (the tile itself links the repo that decided its state).
export function buildCiRepoRows(github: GithubDetail): GithubCiRepoRow[] {
  if (github.repos.length < 2) {
    return [];
  }
  return github.repos.map((repo) => ({
    repo: repo.repo,
    label: `${repo.repo}: ${ciValueLabel(repo.ciState).toLowerCase()}`,
    href: repo.ciUrl,
    tone: ciTone(repo.ciState),
  }));
}
