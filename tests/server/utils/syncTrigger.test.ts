import { describe, expect, it, vi, afterEach } from "vitest";
import type { H3Event } from "h3";

const mockGetHeader = vi.fn();
vi.mock("h3", () => ({ getHeader: mockGetHeader }));

const { requireSyncTriggerSecret } =
  await import("../../../server/utils/syncTrigger");

function eventWithAuthHeader(header: string | undefined): H3Event {
  mockGetHeader.mockReturnValue(header);
  return {} as H3Event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockGetHeader.mockReset();
});

describe("requireSyncTriggerSecret", () => {
  it("passes when the presented Bearer token matches the configured secret", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      syncTriggerSecret: "correct-secret",
    }));
    const event = eventWithAuthHeader("Bearer correct-secret");

    expect(() => requireSyncTriggerSecret(event)).not.toThrow();
  });

  it("throws 401 when no Authorization header is present", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      syncTriggerSecret: "correct-secret",
    }));
    const event = eventWithAuthHeader(undefined);

    expect(() => requireSyncTriggerSecret(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("throws 401 when the header isn't a Bearer token", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      syncTriggerSecret: "correct-secret",
    }));
    const event = eventWithAuthHeader("Basic dXNlcjpwYXNz");

    expect(() => requireSyncTriggerSecret(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("throws 401 when the presented secret doesn't match", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      syncTriggerSecret: "correct-secret",
    }));
    const event = eventWithAuthHeader("Bearer wrong-secret");

    expect(() => requireSyncTriggerSecret(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("fails closed when NUXT_SYNC_TRIGGER_SECRET isn't configured, even if a token is presented", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({ syncTriggerSecret: "" }));
    const event = eventWithAuthHeader("Bearer anything");

    expect(() => requireSyncTriggerSecret(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("accepts a lowercase 'bearer' scheme, per RFC 7235's case-insensitive auth schemes", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      syncTriggerSecret: "correct-secret",
    }));
    const event = eventWithAuthHeader("bearer correct-secret");

    expect(() => requireSyncTriggerSecret(event)).not.toThrow();
  });

  it("rejects a presented secret of different length without matching by coincidence", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      syncTriggerSecret: "a-much-longer-configured-secret",
    }));
    const event = eventWithAuthHeader("Bearer short");

    expect(() => requireSyncTriggerSecret(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});
