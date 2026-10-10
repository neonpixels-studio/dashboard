// The overview's selectable comparison windows, in days. 60 is the ceiling:
// it's how far back the series query reads (SERIES_WINDOW_DAYS in
// server/utils/dashboardQueries.ts) — raise that and the retention window
// before adding a longer option.
export const OVERVIEW_RANGE_OPTIONS = [7, 30, 60] as const;

export type OverviewRangeDays = (typeof OVERVIEW_RANGE_OPTIONS)[number];

export const DEFAULT_OVERVIEW_RANGE: OverviewRangeDays = 30;

// Exact string match against the allowed options (not Number()/parseInt),
// so "07", "7.0", "7abc", "", and repeated `?range=7&range=30` arrays all
// fall back to the default instead of being coerced into a window size.
export function parseOverviewRange(raw: unknown): OverviewRangeDays {
  const match = OVERVIEW_RANGE_OPTIONS.find((option) => String(option) === raw);
  return match ?? DEFAULT_OVERVIEW_RANGE;
}
