import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: 256-bit key, 96-bit IV (NIST-recommended for GCM), 128-bit auth
// tag. Node's built-in crypto module covers this — no dependency needed.
const CIPHER_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_BYTE_LENGTH = 32;
const INITIALIZATION_VECTOR_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

// Bumped if the on-disk payload shape ever changes, so old ciphertext can
// still be told apart from new.
const PAYLOAD_FORMAT_VERSION = "v1";

export class IntegrationSecretError extends Error {}

/**
 * Decodes and validates a base64-encoded 256-bit key. Kept separate from
 * loadIntegrationEncryptionKey() so callers that already have a key in hand
 * (tests, or a future per-record key) never need runtimeConfig.
 */
export function decodeEncryptionKey(base64Key: string): Buffer {
  if (!base64Key) {
    throw new IntegrationSecretError(
      "Integration encryption key is missing. Set NUXT_INTEGRATION_ENCRYPTION_KEY " +
        "(generate one with: openssl rand -base64 32).",
    );
  }

  const decodedKey = Buffer.from(base64Key, "base64");
  if (decodedKey.byteLength !== ENCRYPTION_KEY_BYTE_LENGTH) {
    throw new IntegrationSecretError(
      `Integration encryption key must decode to ${ENCRYPTION_KEY_BYTE_LENGTH} bytes ` +
        `(got ${decodedKey.byteLength}). Generate one with: openssl rand -base64 32`,
    );
  }

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
 */
export function encryptSecret(
  plaintext: string,
  encryptionKey: Buffer,
): string {
  const initializationVector = randomBytes(INITIALIZATION_VECTOR_BYTE_LENGTH);
  const cipher = createCipheriv(
    CIPHER_ALGORITHM,
    encryptionKey,
    initializationVector,
  );

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

/**
 * Reverses encryptSecret(). Throws IntegrationSecretError on a malformed
 * payload, a wrong key, or a tampered ciphertext/auth tag — GCM's tag check
 * makes tamper detection automatic, we just surface it as our own error type.
 */
export function decryptSecret(payload: string, encryptionKey: Buffer): string {
  const [version, ivBase64, authTagBase64, ciphertextBase64] =
    payload.split(":");

  if (
    version !== PAYLOAD_FORMAT_VERSION ||
    !ivBase64 ||
    !authTagBase64 ||
    !ciphertextBase64
  ) {
    throw new IntegrationSecretError(
      `Malformed integration secret payload: expected format "${PAYLOAD_FORMAT_VERSION}:<iv>:<authTag>:<ciphertext>".`,
    );
  }

  const initializationVector = Buffer.from(ivBase64, "base64");
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

  const decipher = createDecipheriv(
    CIPHER_ALGORITHM,
    encryptionKey,
    initializationVector,
  );
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    throw new IntegrationSecretError(
      "Failed to decrypt integration secret: wrong key or tampered payload.",
      { cause },
    );
  }
}
