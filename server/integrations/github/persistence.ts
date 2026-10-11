import { and, eq, sql } from "drizzle-orm";
import { githubItem, githubRepoStatus } from "../../db/schema";
import type { DrizzleDb } from "../../utils/dashboardQueries";
import type { GithubRepoSnapshot } from "./types";

function itemRows(slug: string, snapshot: GithubRepoSnapshot) {
  return snapshot.items.map((item) => ({
    slug,
    repo: snapshot.repo,
    number: item.number,
    kind: item.kind,
    title: item.title,
    url: item.url,
    labels: item.labels,
    itemUpdatedAt: item.itemUpdatedAt,
  }));
}

function statusRow(slug: string, snapshot: GithubRepoSnapshot) {
  return {
    slug,
    repo: snapshot.repo,
    openIssues: snapshot.openIssues,
    openPrs: snapshot.openPrs,
    ciState: snapshot.ci.state,
    ciSha: snapshot.ci.sha,
    commitAt: snapshot.ci.commitAt,
    syncedAt: snapshot.syncedAt,
  };
}

// Items are replaced (delete, then insert) so closed ones disappear. The
// caller runs these inside one db.batch, which Neon executes as a single
// transaction, so a repo is never left half-replaced.
export function buildGithubWrites(
  db: DrizzleDb,
  slug: string,
  snapshots: GithubRepoSnapshot[],
) {
  return snapshots.flatMap((snapshot) => {
    const items = itemRows(slug, snapshot);
    return [
      db
        .delete(githubItem)
        .where(
          and(eq(githubItem.slug, slug), eq(githubItem.repo, snapshot.repo)),
        ),
      ...(items.length ? [db.insert(githubItem).values(items)] : []),
      db
        .insert(githubRepoStatus)
        .values(statusRow(slug, snapshot))
        .onConflictDoUpdate({
          target: [githubRepoStatus.slug, githubRepoStatus.repo],
          set: {
            openIssues: sql`excluded.open_issues`,
            openPrs: sql`excluded.open_prs`,
            ciState: sql`excluded.ci_state`,
            ciSha: sql`excluded.ci_sha`,
            commitAt: sql`excluded.commit_at`,
            syncedAt: sql`excluded.synced_at`,
          },
        }),
    ];
  });
}
