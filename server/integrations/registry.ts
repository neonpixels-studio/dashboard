import type { IntegrationProvider } from "./types";

export class DuplicateProviderError extends Error {
  name = "DuplicateProviderError";
}

export interface ProviderRegistry {
  get(vendor: string): IntegrationProvider | undefined;
  list(): IntegrationProvider[];
}

/**
 * Builds a vendor -> provider lookup from a fixed list. Takes the list as an
 * argument (rather than mutating a module-level map via a `register()` call)
 * so tests can build an isolated registry from any subset of providers
 * without reaching into shared global state.
 */
export function createProviderRegistry(
  providers: IntegrationProvider[],
): ProviderRegistry {
  const providersByVendor = new Map<string, IntegrationProvider>();

  for (const provider of providers) {
    if (providersByVendor.has(provider.vendor)) {
      throw new DuplicateProviderError(
        `A provider for vendor "${provider.vendor}" is already registered.`,
      );
    }
    providersByVendor.set(provider.vendor, provider);
  }

  return {
    get: (vendor) => providersByVendor.get(vendor),
    list: () => [...providersByVendor.values()],
  };
}
