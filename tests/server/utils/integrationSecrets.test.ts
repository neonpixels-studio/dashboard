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

  it("throws when the value is not valid base64, even if it decodes to 32 bytes", () => {
    const notBase64 = "not valid base64! but long enough to slip through-ish==";
    expect(() => decodeEncryptionKey(notBase64)).toThrow(
      IntegrationSecretError,
    );
  });

  it('throws a clear "missing" error for a whitespace-only value', () => {
    expect(() => decodeEncryptionKey("   ")).toThrow(
      "Integration encryption key is missing",
    );
  });

  it("accepts a correctly-decoding key with its base64 padding stripped", () => {
    const unpaddedKey = Buffer.from(validKey, "base64")
      .toString("base64")
      .replace(/=+$/, "");
    expect(decodeEncryptionKey(unpaddedKey)).toHaveLength(32);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it.each(["", "a", "🔑 multi-byte ünicode secret", "x".repeat(4096)])(
    "round-trips %j",
    (plaintext) => {
      const key = decodeEncryptionKey(validKey);
      const payload = encryptSecret(plaintext, key);
      const ciphertextSegment = payload.split(":")[3];

      // Confirms the cipher actually ran rather than e.g. just base64-ing the
      // plaintext through. A substring check would be flaky for 1-char
      // plaintexts (their ciphertext can coincidentally contain that char).
      // Skipped for "" — GCM produces zero ciphertext bytes for zero input
      // regardless of the cipher, so this assertion is vacuous there.
      if (plaintext.length > 0) {
        expect(ciphertextSegment).not.toBe(
          Buffer.from(plaintext, "utf8").toString("base64"),
        );
      }
      expect(decryptSecret(payload, key)).toBe(plaintext);
    },
  );

  it("produces a different payload for the same plaintext each time (random IV)", () => {
    const key = decodeEncryptionKey(validKey);
    const plaintext = "same-secret";

    expect(encryptSecret(plaintext, key)).not.toBe(
      encryptSecret(plaintext, key),
    );
  });

  it("round-trips when associatedData matches on both sides", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key, "basin:stripe");

    expect(decryptSecret(payload, key, "basin:stripe")).toBe("secret-value");
  });

  it("fails to decrypt when associatedData doesn't match (ciphertext moved to a different row)", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key, "basin:stripe");

    expect(() => decryptSecret(payload, key, "markpost:stripe")).toThrow(
      IntegrationSecretError,
    );
  });

  it("rejects an empty associatedData on encrypt instead of silently encrypting unbound", () => {
    const key = decodeEncryptionKey(validKey);
    expect(() => encryptSecret("secret-value", key, "")).toThrow(
      IntegrationSecretError,
    );
  });

  it("rejects an empty associatedData on decrypt instead of silently ignoring it", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);
    expect(() => decryptSecret(payload, key, "")).toThrow(
      IntegrationSecretError,
    );
  });

  it("fails to decrypt a bound payload when associatedData is omitted", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key, "basin:stripe");

    expect(() => decryptSecret(payload, key)).toThrow(IntegrationSecretError);
  });

  it("fails to decrypt an unbound payload when associatedData is supplied", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);

    expect(() => decryptSecret(payload, key, "basin:stripe")).toThrow(
      IntegrationSecretError,
    );
  });

  it("rejects a payload whose IV is the wrong length", () => {
    const key = decodeEncryptionKey(validKey);
    const [version, , authTag, ciphertext] = encryptSecret(
      "secret-value",
      key,
    ).split(":");
    const shortInitializationVector = randomBytes(8).toString("base64");

    expect(() =>
      decryptSecret(
        [version, shortInitializationVector, authTag, ciphertext].join(":"),
        key,
      ),
    ).toThrow(IntegrationSecretError);
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

  it("rejects a payload with extra segments", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);

    expect(() => decryptSecret(`${payload}:extra`, key)).toThrow(
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

  it("rejects a key of the wrong length passed directly to encryptSecret", () => {
    const shortKey = randomBytes(16);
    expect(() => encryptSecret("secret-value", shortKey)).toThrow(
      IntegrationSecretError,
    );
  });

  it("rejects a key of the wrong length passed directly to decryptSecret", () => {
    const key = decodeEncryptionKey(validKey);
    const payload = encryptSecret("secret-value", key);
    const shortKey = randomBytes(16);

    expect(() => decryptSecret(payload, shortKey)).toThrow(
      IntegrationSecretError,
    );
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
