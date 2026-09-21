// Turns real syndication_post rows (AppDetailResponse.syndication) into
// SyndicationPostMatrix's props, plus the two writing-template metric tiles
// derived from the same data (issue #20). `syndication_post` has no title or
// view-count column — SyndicationPostMatrix's `posts[].title` renders the
// row's own `postRef` (the only identifier the schema stores) and no longer
// takes a `views` prop at all (see SyndicationPostMatrix.vue's diff);
// fabricating a view count would violate the same "never render invented
// data" rule the rest of this API follows.
import type { SyndicationMatrixRow } from "#shared/types/dashboard";

export type SyndicationCellTone = "live" | "failed" | "queued" | "off";

interface CellView {
  label: string;
  tone: SyndicationCellTone;
}

const STATUS_VIEWS: Record<
  SyndicationMatrixRow["cells"][number]["status"],
  CellView
> = {
  synced: { label: "✓ LIVE", tone: "live" },
  pending: { label: "• QUEUED", tone: "queued" },
  failed: { label: "✗ FAILED", tone: "failed" },
};

// A post that's never been cross-posted to a given platform has no cell row
// at all (syndicationMatrixForApp only ever groups the rows a post DOES
// have) — distinct from a "failed" attempt, so it gets its own tone rather
// than being folded into one of the three real statuses.
const NOT_POSTED_VIEW: CellView = { label: "— NOT POSTED", tone: "off" };

// Flattens every row's cells into one list — the shared starting point for
// every function below that needs to look across all posts at once, so none
// of them nest a `forEach`/`for` inside another.
function allCells(rows: SyndicationMatrixRow[]): SyndicationMatrixRow["cells"] {
  return rows.flatMap((row) => row.cells);
}

// Every platform this app has ever cross-posted to, sorted for a stable
// column order — the fixed header SyndicationPostMatrix and every post row
// must agree on.
export function syndicationPlatforms(rows: SyndicationMatrixRow[]): string[] {
  const platforms = new Set(allCells(rows).map((cell) => cell.platform));
  return [...platforms].sort();
}

export interface SyndicationMatrixPostView {
  title: string;
  cells: CellView[];
}

export function syndicationMatrixPosts(
  rows: SyndicationMatrixRow[],
  platforms: string[],
): SyndicationMatrixPostView[] {
  return rows.map((row) => ({
    title: row.postRef,
    cells: platforms.map((platform) => {
      const cell = row.cells.find(
        (candidate) => candidate.platform === platform,
      );
      // STATUS_VIEWS is typed as exhaustive over the three real statuses,
      // but that's only a compile-time guarantee — a raw DB row could still
      // carry a value the enum grows to include later. Fall back to the
      // same "not posted" view rather than rendering an undefined label.
      return cell
        ? (STATUS_VIEWS[cell.status] ?? NOT_POSTED_VIEW)
        : NOT_POSTED_VIEW;
    }),
  }));
}

// Total failed cross-posts across every post/platform — the writing
// template's "CROSS-POST FAILURES" tile.
export function syndicationFailedCount(rows: SyndicationMatrixRow[]): number {
  return allCells(rows).filter((cell) => cell.status === "failed").length;
}

// Count of distinct platforms with at least one successfully synced post —
// the writing template's "PLATFORMS LIVE" tile.
export function syndicationLivePlatformCount(
  rows: SyndicationMatrixRow[],
): number {
  const live = allCells(rows)
    .filter((cell) => cell.status === "synced")
    .map((cell) => cell.platform);
  return new Set(live).size;
}
