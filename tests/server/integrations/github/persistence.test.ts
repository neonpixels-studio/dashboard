import { describe, expect, it, vi } from "vitest";
import { buildGithubWrites } from "../../../../server/integrations/github/persistence";
import { persistProviderResult } from "../../../../server/integrations/persist";
import type { GithubRepoSnapshot } from "../../../../server/integrations/github/types";
import type { IntegrationConfigRow } from "../../../../server/integrations/types";

type FakeDb = Parameters<typeof buildGithubWrites>[0];

// Records the order and payload of each write the builders chain, so the
// replace-then-insert contract is asserted without a database.
function createRecordingDb() {
  const writes: { op: string; payload?: unknown }[] = [];
  const batch = vi.fn().mockResolvedValue(undefined);
  const db = {
    batch,
    delete: () => ({
      where: () => {
        const write = { op: "delete" };
        writes.push(write);
        return write;
      },
    }),
    insert: () => ({
      values: (payload: unknown) => {
        const write = { op: "insert", payload };
        writes.push(write);
        return { ...write, onConflictDoUpdate: () => write };
      },
    }),
  } as unknown as FakeDb;
  return { db, writes, batch };
}

function snapshot(repo: string, itemNumbers: number[]): GithubRepoSnapshot {
  return {
    repo,
    openIssues: itemNumbers.length,
    openPrs: 0,
    ci: { state: "failing", sha: "abc", commitAt: new Date("2026-10-09") },
    items: itemNumbers.map((number) => ({
      number,
      kind: "issue" as const,
      title: `T${number}`,
      url: `https://github.com/x/${repo}/issues/${number}`,
      labels: ["bug"],
      itemUpdatedAt: new Date("2026-10-09"),
    })),
    syncedAt: new Date("2026-10-10"),
  };
}

describe("buildGithubWrites", () => {
  it("deletes a repo's old items before inserting the new ones and its status", () => {
    const { db, writes } = createRecordingDb();

    buildGithubWrites(db, "markpost", [snapshot("markpost-cli", [4, 9])]);

    expect(writes.map((write) => write.op)).toEqual([
      "delete",
      "insert",
      "insert",
    ]);
    expect(writes[1]!.payload).toEqual([
      expect.objectContaining({
        slug: "markpost",
        repo: "markpost-cli",
        number: 4,
        labels: ["bug"],
      }),
      expect.objectContaining({ number: 9 }),
    ]);
    expect(writes[2]!.payload).toMatchObject({
      slug: "markpost",
      repo: "markpost-cli",
      openIssues: 2,
      ciState: "failing",
      ciSha: "abc",
    });
  });

  it("still clears a repo whose items all closed, without inserting an empty batch", () => {
    const { db, writes } = createRecordingDb();

    buildGithubWrites(db, "basin", [snapshot("basin", [])]);

    expect(writes.map((write) => write.op)).toEqual(["delete", "insert"]);
    expect(writes[1]!.payload).toMatchObject({ repo: "basin", openIssues: 0 });
  });

  it("replaces each repo of a multi-repo property independently", () => {
    const { db, writes } = createRecordingDb();

    buildGithubWrites(db, "markpost", [
      snapshot("markpost", [1]),
      snapshot("markpost-cli", [1]),
    ]);

    expect(writes.map((write) => write.op)).toEqual([
      "delete",
      "insert",
      "insert",
      "delete",
      "insert",
      "insert",
    ]);
  });

  it("writes nothing when the provider returned no GitHub data", () => {
    const { db, writes } = createRecordingDb();
    expect(buildGithubWrites(db, "basin", [])).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe("persistProviderResult with GitHub data", () => {
  const ROW = { slug: "markpost", vendor: "github" } as IntegrationConfigRow;

  it("sends the replace as one atomic batch", async () => {
    const { db, batch } = createRecordingDb();

    await persistProviderResult(db, ROW, {
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
      github: [snapshot("markpost", [1])],
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]![0]).toHaveLength(3);
  });

  it("does nothing for a skipped, not-configured result", async () => {
    const { db, batch, writes } = createRecordingDb();

    await persistProviderResult(db, ROW, {
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
      skipped: true,
    });

    expect(batch).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
