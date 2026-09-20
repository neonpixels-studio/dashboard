import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: 256-bit key, 96-bit IV (NIST-recommended for GCM), 128-bit auth
// tag. Node's built-in crypto module covers this — no dependency needed.
const CIPHER_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_BYTE_LENGTH = 32;
const INITIALIZATION_VECTOR_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const PAYLOAD_SEGMENT_COUNT = 4;

// Bumped if the on-disk payload shape ever changes, so old ciphertext can
// still be told apart from new.
const PAYLOAD_FORMAT_VERSION = "v1";

export class IntegrationSecretError extends Error {
  name = "IntegrationSecretError";
}

function assertKeyLength(encryptionKey: Buffer): void {
  if (encryptionKey.byteLength !== ENCRYPTION_KEY_BYTE_LENGTH) {
    throw new IntegrationSecretError(
      `Integration encryption key must be ${ENCRYPTION_KEY_BYTE_LENGTH} bytes ` +
        `(got ${encryptionKey.byteLength}). Generate one with: openssl rand -base64 32`,
    );
  }
}

// Shared by encryptSecret and decryptSecret so "empty associatedData" can
// never mean something different on one side than the other — an empty
// string and "no associatedData" must both be rejected, not silently
// treated as unbound.
function assertAssociatedDataNotEmpty(
  associatedData: string | undefined,
): void {
  if (associatedData !== undefined && associatedData.length === 0) {
    throw new IntegrationSecretError(
      "associatedData was provided but empty — pass the row identity or omit the argument.",
    );
  }
}

/**
 * Decodes and validates a base64-encoded 256-bit key. Kept separate from
 * loadIntegrationEncryptionKey() so callers that already have a key in hand
 * (tests, or a future per-record key) never need runtimeConfig.
 */
export function decodeEncryptionKey(base64Key: string): Buffer {
  const trimmedKey = base64Key.trim();
  if (!trimmedKey) {
    throw new IntegrationSecretError(
      "Integration encryption key is missing. Set NUXT_INTEGRATION_ENCRYPTION_KEY " +
        "(generate one with: openssl rand -base64 32).",
    );
  }

  const decodedKey = Buffer.from(trimmedKey, "base64");
  // Buffer.from(..., "base64") silently drops invalid characters instead of
  // throwing, so a mistyped key that still happens to decode to 32 bytes
  // would otherwise pass validation as a different key than intended.
  // Padding is normalized away first so a correctly-decoding unpadded key
  // (some secret stores strip it) isn't rejected just for missing "=".
  const canonicalKey = decodedKey.toString("base64").replace(/=+$/, "");
  if (canonicalKey !== trimmedKey.replace(/=+$/, "")) {
    throw new IntegrationSecretError(
      "Integration encryption key is not valid base64. Generate one with: openssl rand -base64 32",
    );
  }

  assertKeyLength(decodedKey);
  return decodedKey;
}

/**
 * Reads the shared integration encryption key from runtime config. This is
 * the only function in this module that touches Nuxt/env — the cipher
 * functions below take a key directly, so they're unit-testable without
 * runtimeConfig or real secrets.
 */
export function loadIntegrationEncryptionKey(): Buffer {
  return decodeEncryptionKey(useRuntimeConfig().integrationEncryptionKey);
}

/**
 * Encrypts a per-app integration secret for storage in a text column (e.g.
 * the future `integration_config` table). Returns a single opaque string:
 *   v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>
 *
 * `associatedData`, when passed, is authenticated (not encrypted) alongside
 * the ciphertext via GCM's AAD — pass something that identifies which row the
 * secret belongs to (e.g. `${appSlug}:${integrationKey}`) so a ciphertext
 * copied into a different row fails to decrypt instead of silently
 * succeeding. Must match exactly on decrypt.
 */
export function encryptSecret(
  plaintext: string,
  encryptionKey: Buffer,
  associatedData?: string,
): string {
  assertKeyLength(encryptionKey);
  assertAssociatedDataNotEmpty(associatedData);

  const initializationVector = randomBytes(INITIALIZATION_VECTOR_BYTE_LENGTH);
  const cipher = createCipheriv(
    CIPHER_ALGORITHM,
    encryptionKey,
    initializationVector,
  );
  if (associatedData !== undefined) {
    cipher.setAAD(Buffer.from(associatedData, "utf8"));
  }

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PAYLOAD_FORMAT_VERSION,
    initializationVector.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

interface ParsedPayloadSegments {
  version: string;
  initializationVectorBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
}

/**
 * Splits and validates the `v1:<iv>:<authTag>:<ciphertext>` segment count.
 * TS's noUncheckedIndexedAccess types each destructured element as possibly
 * undefined, so this same length check both rejects a malformed payload and
 * narrows the four segments to `string` for callers.
 */
function parsePayloadSegments(payload: string): ParsedPayloadSegments {
  const segments = payload.split(":");
  const [version, initializationVectorBase64, authTagBase64, ciphertextBase64] =
    segments;
  if (
    segments.length !== PAYLOAD_SEGMENT_COUNT ||
    version === undefined ||
    initializationVectorBase64 === undefined ||
    authTagBase64 === undefined ||
    ciphertextBase64 === undefined
  ) {
    throw new IntegrationSecretError(
      `Malformed integration secret payload: expected format "${PAYLOAD_FORMAT_VERSION}:<iv>:<authTag>:<ciphertext>".`,
    );
  }
  return {
    version,
    initializationVectorBase64,
    authTagBase64,
    ciphertextBase64,
  };
}

/**
 * Reverses encryptSecret(). Throws IntegrationSecretError on a malformed
 * payload, a wrong-length key, a wrong key, a mismatched `associatedData`, or
 * a tampered ciphertext/auth tag — GCM's tag check makes tamper detection
 * automatic, we just surface it as our own error type.
 */
export function decryptSecret(
  payload: string,
  encryptionKey: Buffer,
  associatedData?: string,
): string {
  assertKeyLength(encryptionKey);
  assertAssociatedDataNotEmpty(associatedData);

  const {
    version,
    initializationVectorBase64,
    authTagBase64,
    ciphertextBase64,
  } = parsePayloadSegments(payload);
  if (version !== PAYLOAD_FORMAT_VERSION) {
    throw new IntegrationSecretError(
      `Unsupported integration secret payload version "${version}".`,
    );
  }

  const initializationVector = Buffer.from(
    initializationVectorBase64,
    "base64",
  );
  const authTag = Buffer.from(authTagBase64, "base64");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");

  if (
    initializationVector.byteLength !== INITIALIZATION_VECTOR_BYTE_LENGTH ||
    authTag.byteLength !== AUTH_TAG_BYTE_LENGTH
  ) {
    throw new IntegrationSecretError(
      "Malformed integration secret payload: invalid IV or auth tag length.",
    );
  }

  try {
    const decipher = createDecipheriv(
      CIPHER_ALGORITHM,
      encryptionKey,
      initializationVector,
    );
    decipher.setAuthTag(authTag);
    if (associatedData !== undefined) {
      decipher.setAAD(Buffer.from(associatedData, "utf8"));
    }

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    throw new IntegrationSecretError(
      "Failed to decrypt integration secret: wrong key, wrong associatedData, or tampered payload.",
      { cause },
    );
  }
}
