import { createProviderRegistry } from "./registry";
import { PROVIDERS } from "./providers";

// The registry the orchestrator resolves vendors from at runtime. Built once
// from the fixed PROVIDERS list above; see registry.ts for why the registry
// itself doesn't hold module-level mutable state.
export const integrationRegistry = createProviderRegistry(PROVIDERS);

export * from "./types";
export * from "./config";
