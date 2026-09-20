import {
  decryptSecret,
  loadIntegrationEncryptionKey,
} from "../utils/integrationSecrets";
import type { IntegrationConfig, IntegrationConfigRow } from "./types";

// A row carries at most one secret source (enforced by the
// integration_config_single_secret DB check): `secretRef` names a shared
// studio-wide env var (e.g. "NUXT_SENTRY_AUTH_TOKEN"); `encryptedSecret` is
// a per-app AES-256-GCM override from server/utils/integrationSecrets.ts.
// `loadDecryptionKey` is a thunk (not the key itself) so a row that only
// uses `secretRef` never touches runtimeConfig — only the encryptedSecret
// branch actually needs the key, so only that branch calls it.
function resolveSecret(
  row: IntegrationConfigRow,
  loadDecryptionKey: () => Buffer,
): string | null {
  if (row.secretRef) {
    return process.env[row.secretRef] ?? null;
  }
  if (row.encryptedSecret) {
    return decryptSecret(
      row.encryptedSecret,
      loadDecryptionKey(),
      `${row.slug}:${row.vendor}`,
    );
  }
  return null;
}

/**
 * Resolves a raw `integration_config` row into the `IntegrationConfig` a
 * provider's `fetch()` receives. Providers see one already-resolved
 * `secret` field and never need to know (or branch on) whether it came from
 * a shared env var or a decrypted per-app override.
 */
export function resolveIntegrationConfig(
  row: IntegrationConfigRow,
  loadDecryptionKey: () => Buffer = loadIntegrationEncryptionKey,
): IntegrationConfig {
  return {
    slug: row.slug,
    vendor: row.vendor,
    externalId: row.externalId,
    secret: resolveSecret(row, loadDecryptionKey),
  };
}
