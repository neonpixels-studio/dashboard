// Turns real syndication_post rows (AppDetailResponse.syndication) into
// SyndicationPostMatrix's props, plus the two writing-template metric tiles
// derived from the same data (issue #20). `syndication_post` has no title
// column, so SyndicationPostMatrix's `posts[].title` renders the row's own
// `postRef`. Per-platform views render only where the platform reported them
// (null for Medium), never as an invented zero.
import type { SyndicationMatrixRow } from "#shared/types/dashboard";
import { formatCount } from "./rollupFormat";

export type SyndicationCellTone = "live" | "failed" | "queued" | "off";

interface StatusView {
  label: string;
  tone: SyndicationCellTone;
}

interface CellView extends StatusView {
  views: string | null;
}

const STATUS_VIEWS: Record<
  SyndicationMatrixRow["cells"][number]["status"],
  StatusView
> = {
  synced: { label: "✓ LIVE", tone: "live" },
  pending: { label: "• QUEUED", tone: "queued" },
  failed: { label: "✗ FAILED", tone: "failed" },
};

// A post that's never been cross-posted to a given platform has no cell row
// at all (syndicationMatrixForApp only ever groups the rows a post DOES
// have) — distinct from a "failed" attempt, so it gets its own tone rather
// than being folded into one of the three real statuses.
const NOT_POSTED_VIEW: CellView = {
  label: "— NOT POSTED",
  tone: "off",
  views: null,
};

function formatViews(views: number | null): string | null {
  return views === null ? null : `${formatCount(views)} views`;
}

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
      const statusView = cell ? STATUS_VIEWS[cell.status] : undefined;
      if (!cell || !statusView) {
        return NOT_POSTED_VIEW;
      }
      return { ...statusView, views: formatViews(cell.views) };
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
