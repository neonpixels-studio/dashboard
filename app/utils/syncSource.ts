// Builds SourcesFooter's chip list from real sync_status rows (issue #20) —
// the detail-page equivalent of the design's original "SYNCED Xm ago" chips.
// Renders an absolute date (formatSyncedDate), not a relative "Xm ago": the
// relative form depends on wall-clock "now", which SSR and the initial
// client render can't agree on before mount (see DataErrorState.vue's
// identical reasoning) — real vendor/timestamp data, safe to render
// immediately, is worth more here than shaving the display down to minutes.
//
// `note`/`noteTag` (originally "NOT USED ON THIS APP") aren't rebuilt here:
// AppDetailResponse.sources only lists vendors that have ever synced for
// this app, not the full integration catalog, so there's no honest way to
// name which vendors are absent — that needs the integration_config catalog,
// which this endpoint doesn't return.
import type { SyncSource } from "#shared/types/dashboard";
import { formatSyncedDate } from "./rollupFormat";

export interface SourceChip {
  label: string;
  tone?: "ok" | "warn";
}

export function buildSourceChips(sources: SyncSource[]): SourceChip[] {
  return sources.map((source) => ({
    label: sourceChipLabel(source),
    tone: source.ok ? "ok" : "warn",
  }));
}

function sourceChipLabel(source: SyncSource): string {
  const vendor = source.vendor.toUpperCase();
  if (!source.lastSuccessAt) {
    return `${vendor} · never synced`;
  }
  const syncedDate = formatSyncedDate(source.lastSuccessAt);
  return syncedDate
    ? `${vendor} · ${syncedDate}`
    : `${vendor} · sync date unknown`;
}
