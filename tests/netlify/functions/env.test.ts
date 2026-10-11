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
  it("decrypts .env.production in strict mode for the production deploy", async () => {
    const { loadEnv } = await importFreshEnvModule();

    loadEnv("production");

    expect(configMock).toHaveBeenCalledWith({
      path: ".env.production",
      strict: true,
    });
  });

  it.each(["deploy-preview", "branch-deploy"])(
    "decrypts .env.dev in strict mode for a %s",
    async (deployContext) => {
      const { loadEnv } = await importFreshEnvModule();

      loadEnv(deployContext);

      expect(configMock).toHaveBeenCalledWith({
        path: ".env.dev",
        strict: true,
      });
    },
  );

  it("only decrypts once per function instance", async () => {
    const { loadEnv } = await importFreshEnvModule();

    loadEnv("production");
    loadEnv("production");

    expect(configMock).toHaveBeenCalledOnce();
  });

  it("propagates a decrypt failure and retries on the next call", async () => {
    configMock.mockImplementationOnce(() => {
      throw new Error("MISSING_PRIVATE_KEY");
    });
    const { loadEnv } = await importFreshEnvModule();

    expect(() => loadEnv("production")).toThrow("MISSING_PRIVATE_KEY");
    loadEnv("production");

    expect(configMock).toHaveBeenCalledTimes(2);
  });
});
