// Wires the real DB (persist.ts), the real secret resolution (config.ts),
// and the real provider registry (./index) into the shape orchestrator.ts's
// runSync needs. Kept as its own thin factory — rather than inlined in
// server/api/sync.post.ts — so the route handler has nothing to mock beyond
// this one function, and this file has nothing to mock beyond `db`.
import type { DrizzleDb } from "../utils/dashboardQueries";
import { resolveIntegrationConfig } from "./config";
import type { SyncOrchestratorDeps } from "./orchestrator";
import {
  listEnabledIntegrationConfigs,
  persistProviderResult,
  recordSyncStatus,
} from "./persist";
import { integrationRegistry } from "./index";

export function buildSyncOrchestratorDeps(db: DrizzleDb): SyncOrchestratorDeps {
  return {
    listEnabledConfigRows: () => listEnabledIntegrationConfigs(db),
    resolveConfig: resolveIntegrationConfig,
    registry: integrationRegistry,
    persistProviderResult: (row, result) =>
      persistProviderResult(db, row, result),
    recordSyncStatus: (status) => recordSyncStatus(db, status),
  };
}
