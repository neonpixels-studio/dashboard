import { afterEach, describe, expect, it, vi } from "vitest";

const configMock = vi.fn();

vi.mock("@dotenvx/dotenvx", () => ({
  default: { config: (...args: unknown[]) => configMock(...args) },
}));

// loadEnv() memoizes via module-scoped state, so each test gets a fresh
// module instance.
async function importFreshEnvModule() {
  vi.resetModules();
  return import("../../../netlify/functions/env");
}

afterEach(() => {
  configMock.mockReset();
});

describe("loadEnv", () => {
  it("decrypts .env.production in strict mode", async () => {
    const { loadEnv } = await importFreshEnvModule();

    loadEnv();

    expect(configMock).toHaveBeenCalledWith({
      path: ".env.production",
      strict: true,
    });
  });

  it("only decrypts once per function instance", async () => {
    const { loadEnv } = await importFreshEnvModule();

    loadEnv();
    loadEnv();

    expect(configMock).toHaveBeenCalledOnce();
  });

  it("propagates a decrypt failure and retries on the next call", async () => {
    configMock.mockImplementationOnce(() => {
      throw new Error("MISSING_PRIVATE_KEY");
    });
    const { loadEnv } = await importFreshEnvModule();

    expect(() => loadEnv()).toThrow("MISSING_PRIVATE_KEY");
    loadEnv();

    expect(configMock).toHaveBeenCalledTimes(2);
  });
});
