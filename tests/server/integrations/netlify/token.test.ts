import { afterEach, describe, expect, it, vi } from "vitest";
import { readNetlifyToken } from "../../../../server/integrations/netlify/token";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readNetlifyToken", () => {
  it("returns the env token", () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", " nfp_abc ");
    expect(readNetlifyToken()).toBe("nfp_abc");
  });

  it("falls back to the build-time runtimeConfig value", () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "");
    vi.stubGlobal("useRuntimeConfig", () => ({ netlifyToken: "nfp_cfg" }));
    expect(readNetlifyToken()).toBe("nfp_cfg");
  });

  it.each([[""], ["   "]])("is null for a blank token %j", (value) => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", value);
    expect(readNetlifyToken()).toBeNull();
  });
});
