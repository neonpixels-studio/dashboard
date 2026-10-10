import { describe, expect, it } from "vitest";
import { clerkDashboardUsersUrl } from "../../../../server/integrations/clerk/dashboardLink";
import type { IntegrationConfigRow } from "../../../../server/integrations/types";

function row(overrides: Partial<IntegrationConfigRow>): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "clerk",
    enabled: true,
    externalId: null,
    secretRef: null,
    encryptedSecret: null,
    ...overrides,
  } as IntegrationConfigRow;
}

describe("clerkDashboardUsersUrl", () => {
  it("builds the instance-specific users URL from app/instance ids", () => {
    expect(
      clerkDashboardUsersUrl([row({ externalId: " app_2abc/ins_9xyz " })]),
    ).toBe(
      "https://dashboard.clerk.com/apps/app_2abc/instances/ins_9xyz/users",
    );
  });

  it("falls back to the last-active users shortcut when no ids are configured", () => {
    expect(clerkDashboardUsersUrl([row({ externalId: null })])).toBe(
      "https://dashboard.clerk.com/~/users",
    );
  });

  it("falls back rather than interpolating a malformed external id into a URL", () => {
    expect(clerkDashboardUsersUrl([row({ externalId: "../evil?x=1" })])).toBe(
      "https://dashboard.clerk.com/~/users",
    );
  });

  it("returns null with no clerk row, or only a disabled one", () => {
    expect(clerkDashboardUsersUrl([])).toBeNull();
    expect(clerkDashboardUsersUrl([row({ vendor: "stripe" })])).toBeNull();
    expect(clerkDashboardUsersUrl([row({ enabled: false })])).toBeNull();
  });
});
