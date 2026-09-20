import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";

const runtimeConfig = { integrationEncryptionKey: "" };
vi.stubGlobal("useRuntimeConfig", () => runtimeConfig);

const {
  IntegrationSecretError,
  decodeEncryptionKey,
  encryptSecret,
  decryptSecret,
  loadIntegrationEncryptionKey,
} = await import("../../../server/utils/integrationSecrets");

const validKey = randomBytes(32).toString("base64");
const otherKey = randomBytes(32).toString("base64");

describe("decodeEncryptionKey", () => {
  it("decodes a valid base64 32-byte key", () => {
    expect(decodeEncryptionKey(validKey)).toHaveLength(32);
  });

  it("throws when the key is missing", () => {
    expect(() => decodeEncryptionKey("")).toThrow(IntegrationSecretError);
  });

  it("throws when the decoded key is the wrong length", () => {
    const shortKey = randomBytes(16).toString("base64");
    expect(() => decodeEncryptionKey(shortKey)).toThrow(IntegrationSecretError);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext through encrypt then decrypt", () => {
    const key = decodeEncryptionKey(validKey);
    const plaintext = "sk_live_super_secret_value";

    const payload = encryptSecret(plaintext, key);

    expect(payload).not.toContain(plaintext);
    expect(decryptSecret(payload, key)).toBe(plaintext);
  });

  it("produces a different payload for the same plaintext each time (random IV)", () => {
    const key = decodeEncryptionKey(validKey);
    const plaintext = "same-secret";

    expect(encryptSecret(plaintext, key)).not.toBe(
      encryptSecret(plaintext, key),
    );
  });

  it("fails to decrypt with the wrong key", () => {
    const key = decodeEncryptionKey(validKey);
    const wrongKey = decodeEncryptionKey(otherKey);
    const payload = encryptSecret("secret-value", key);

    expect(() => decryptSecret(payload, wrongKey)).toThrow(
      IntegrationSecretError,
    );
  });

  it("fails to decrypt when the ciphertext has been tampered with", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);
    const [version, iv, authTag, ciphertext] = payload.split(":");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tamperedPayload = [
      version,
      iv,
      authTag,
      tamperedCiphertext.toString("base64"),
    ].join(":");

    expect(() => decryptSecret(tamperedPayload, key)).toThrow(
      IntegrationSecretError,
    );
  });

  it("fails to decrypt when the auth tag has been tampered with", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);
    const [version, iv, authTag, ciphertext] = payload.split(":");
    const tamperedAuthTag = Buffer.from(authTag, "base64");
    tamperedAuthTag[0] ^= 0xff;
    const tamperedPayload = [
      version,
      iv,
      tamperedAuthTag.toString("base64"),
      ciphertext,
    ].join(":");

    expect(() => decryptSecret(tamperedPayload, key)).toThrow(
      IntegrationSecretError,
    );
  });

  it("rejects a malformed payload missing segments", () => {
    const key = decodeEncryptionKey(validKey);
    expect(() => decryptSecret("not-a-real-payload", key)).toThrow(
      IntegrationSecretError,
    );
  });

  it("rejects a payload with an unknown format version", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);
    const [, iv, authTag, ciphertext] = payload.split(":");

    expect(() =>
      decryptSecret(["v2", iv, authTag, ciphertext].join(":"), key),
    ).toThrow(IntegrationSecretError);
  });
});

describe("loadIntegrationEncryptionKey", () => {
  it("decodes the key from runtimeConfig.integrationEncryptionKey", () => {
    runtimeConfig.integrationEncryptionKey = validKey;
    expect(loadIntegrationEncryptionKey()).toHaveLength(32);
  });

  it("throws when runtimeConfig has no key configured", () => {
    runtimeConfig.integrationEncryptionKey = "";
    expect(() => loadIntegrationEncryptionKey()).toThrow(
      IntegrationSecretError,
    );
  });
});
