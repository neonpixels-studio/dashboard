import { describe, expect, it, vi } from "vitest";
import { seedIntegrationConfig } from "../../../server/db/seed";
import { integrationConfig } from "../../../server/db/schema";
import type { IntegrationConfigSeedRow } from "../../../server/db/seedData";

type FakeDb = Parameters<typeof seedIntegrationConfig>[0];

// Stubs just the chain `seedIntegrationConfig` calls
// (insert -> values -> onConflictDoNothing -> returning), so the insert path
// is exercised without a live database, while still letting tests assert on
// what was actually passed to each step.
function createFakeDb(insertedRowCount: number) {
  const returning = vi
    .fn()
    .mockResolvedValue(
      Array.from({ length: insertedRowCount }, (_, id) => ({ id })),
    );
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  return {
    db: { insert } as unknown as FakeDb,
    insert,
    values,
    onConflictDoNothing,
  };
}

const SAMPLE_ROWS: IntegrationConfigSeedRow[] = [
  { slug: "basin", vendor: "ga4", enabled: false },
  { slug: "basin", vendor: "stripe", enabled: false },
];

describe("seedIntegrationConfig", () => {
  it("returns zero attempted/inserted and never touches the db for an empty row set", async () => {
    const { db, insert } = createFakeDb(0);
    const result = await seedIntegrationConfig(db, []);
    expect(result).toEqual({ attempted: 0, inserted: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("reports the full count when every row inserts cleanly", async () => {
    const { db } = createFakeDb(SAMPLE_ROWS.length);
    const result = await seedIntegrationConfig(db, SAMPLE_ROWS);
    expect(result).toEqual({ attempted: 2, inserted: 2 });
  });

  it("reports fewer inserted than attempted when some rows already exist", async () => {
    const { db } = createFakeDb(1);
    const result = await seedIntegrationConfig(db, SAMPLE_ROWS);
    expect(result).toEqual({ attempted: 2, inserted: 1 });
  });

  it("inserts exactly the given rows into integration_config, skipping conflicts on (slug, vendor)", async () => {
    const { db, insert, values, onConflictDoNothing } = createFakeDb(
      SAMPLE_ROWS.length,
    );
    await seedIntegrationConfig(db, SAMPLE_ROWS);
    expect(insert).toHaveBeenCalledWith(integrationConfig);
    expect(values).toHaveBeenCalledWith(SAMPLE_ROWS);
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [integrationConfig.slug, integrationConfig.vendor],
    });
  });
});
