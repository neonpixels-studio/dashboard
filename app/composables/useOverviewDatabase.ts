import type { DatabasePanel } from "#shared/types/database";

// Wraps `GET /api/overview/database`: the dashboard's own Neon usage for the
// "/" overview (it has no /apps page to host the panel).
export function useOverviewDatabase() {
  const { data, pending, error, refresh } = useFetch<DatabasePanel | null>(
    "/api/overview/database",
    // Null (not undefined) while loading or before the first sync, so the
    // panel's `panel: DatabasePanel | null` prop takes it as-is.
    { key: "overview-database", default: () => null },
  );
  return { data, pending, error, refresh };
}
