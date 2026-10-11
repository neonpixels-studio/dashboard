import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNeonDatabase,
  neonProvider,
  resolveNeonProjectId,
} from "../../../../server/integrations/neon/provider";
import type {
  NeonBranchSummary,
  NeonClient,
  NeonProjectUsage,
} from "../../../../server/integrations/neon/types";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const CAPTURED_AT = new Date("2026-10-10T12:00:00Z");

const USAGE: NeonProjectUsage = {
  computeTimeSeconds: 86_400,
  activeTimeSeconds: 309_600,
  syntheticStorageBytes: 0,
  dataTransferBytes: 9_000_000,
  writtenDataBytes: 500,
  periodStart: new Date("2026-10-01T00:00:00Z"),
  periodEnd: new Date("2026-11-01T00:00:00Z"),
};

const BRANCHES: NeonBranchSummary[] = [
  {
    name: "production",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    logicalSizeBytes: 20_000_000,
  },
  { name: "development", createdAt: null, logicalSizeBytes: 11_000_000 },
];

function fakeClient(overrides: Partial<NeonClient> = {}) {
  const client: NeonClient = {
    getProjectUsage: vi.fn(async () => USAGE),
    listBranches: vi.fn(async () => BRANCHES),
    ...overrides,
  };
  return client;
}

function neonConfig(overrides = {}) {
  return createTestIntegrationConfig({
    slug: "basin",
    vendor: "neon",
    externalId: "proj-basin",
    secret: "napi_key",
    ...overrides,
  });
}

describe("resolveNeonProjectId", () => {
  it("prefers the integration_config external_id", () => {
    vi.stubEnv("NUXT_NEON_PROJECT_ID_BASIN", "from-env");
    expect(resolveNeonProjectId(neonConfig({ externalId: " proj-row " }))).toBe(
      "proj-row",
    );
  });

  it("falls back to the per-slug env var", () => {
    vi.stubEnv("NUXT_NEON_PROJECT_ID_BASIN", "from-env");
    expect(resolveNeonProjectId(neonConfig({ externalId: null }))).toBe(
      "from-env",
    );
  });

  it("is null when neither is set", () => {
    vi.stubEnv("NUXT_NEON_PROJECT_ID_BASIN", "");
    expect(resolveNeonProjectId(neonConfig({ externalId: null }))).toBeNull();
  });
});

describe("fetchNeonDatabase", () => {
  it("maps usage and branches, summing branch sizes when Neon reports no storage figure", async () => {
    const client = fakeClient();

    const result = await fetchNeonDatabase(neonConfig(), client, CAPTURED_AT);

    expect(client.getProjectUsage).toHaveBeenCalledWith("proj-basin");
    expect(client.listBranches).toHaveBeenCalledWith("proj-basin");
    expect(result.skipped).toBeUndefined();
    expect(result.neonDatabase).toEqual({
      usage: {
        computeTimeSeconds: 86_400,
        activeTimeSeconds: 309_600,
        storageBytes: 31_000_000,
        dataTransferBytes: 9_000_000,
        writtenDataBytes: 500,
        periodStart: USAGE.periodStart,
        periodEnd: USAGE.periodEnd,
        capturedAt: CAPTURED_AT,
      },
      branches: [
        { name: "production", createdAt: new Date("2026-07-01T00:00:00Z") },
        { name: "development", createdAt: null },
      ],
    });
  });

  it("uses Neon's own storage figure when it is non-zero", async () => {
    const client = fakeClient({
      getProjectUsage: vi.fn(async () => ({
        ...USAGE,
        syntheticStorageBytes: 55_000_000,
      })),
    });

    const result = await fetchNeonDatabase(neonConfig(), client, CAPTURED_AT);

    expect(result.neonDatabase?.usage.storageBytes).toBe(55_000_000);
  });

  it("skips without calling Neon when no project id is configured", async () => {
    vi.stubEnv("NUXT_NEON_PROJECT_ID_BASIN", "");
    const client = fakeClient();

    const result = await fetchNeonDatabase(
      neonConfig({ externalId: null }),
      client,
    );

    expect(result.skipped).toBe(true);
    expect(result.neonDatabase).toBeUndefined();
    expect(client.getProjectUsage).not.toHaveBeenCalled();
  });

  it("propagates a Neon failure instead of recording zeros", async () => {
    const client = fakeClient({
      listBranches: vi.fn(async () => {
        throw new Error("Neon API request failed with status 500.");
      }),
    });

    await expect(
      fetchNeonDatabase(neonConfig(), client, CAPTURED_AT),
    ).rejects.toThrow(/status 500/);
  });
});

describe("neonProvider", () => {
  it("identifies itself as the neon vendor", () => {
    expect(neonProvider.vendor).toBe("neon");
  });

  it("skips cleanly when no API key is configured anywhere", async () => {
    vi.stubEnv("NUXT_NEON_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await neonProvider.fetch(neonConfig({ secret: null }));

    expect(result.skipped).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("end-to-end: reads the key from NUXT_NEON_API_KEY and calls the Neon API with it", async () => {
    vi.stubEnv("NUXT_NEON_API_KEY", "napi_from_env");
    const fetchSpy = vi.fn(async (url: URL) => {
      const body = url.pathname.endsWith("/branches")
        ? { branches: [{ name: "production", logical_size: 1_000 }] }
        : {
            project: {
              compute_time_seconds: 3_600,
              active_time_seconds: 0,
              synthetic_storage_size: 0,
              data_transfer_bytes: 0,
              written_data_bytes: 0,
              consumption_period_start: "2026-10-01T00:00:00Z",
              consumption_period_end: "2026-11-01T00:00:00Z",
            },
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await neonProvider.fetch(neonConfig({ secret: null }));

    expect(result.neonDatabase?.usage.computeTimeSeconds).toBe(3_600);
    expect(result.neonDatabase?.usage.storageBytes).toBe(1_000);
    const init = fetchSpy.mock.calls[0]![1] as unknown as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer napi_from_env",
    );
  });
});
