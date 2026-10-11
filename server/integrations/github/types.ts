import type {
  GithubCiState,
  GithubItemKind,
} from "../../../shared/types/dashboard";

export interface GithubItemInput {
  number: number;
  kind: GithubItemKind;
  title: string;
  url: string;
  labels: string[];
  itemUpdatedAt: Date;
}

export interface GithubMainCi {
  state: GithubCiState;
  sha: string;
  commitAt: Date;
}

// Everything one sync learns about one repo. The persist step replaces that
// repo's github_item rows with `items` and overwrites its github_repo_status.
export interface GithubRepoSnapshot {
  repo: string;
  openIssues: number;
  openPrs: number;
  ci: GithubMainCi;
  items: GithubItemInput[];
  syncedAt: Date;
}
