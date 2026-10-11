import { describe, it, expect, vi } from "vitest";
import {
  createNeonClient,
  LOCKED_RETRY_ATTEMPTS,
} from "../../scripts/neon-api.js";
import {
  PREVIEW_PARENT_BRANCH_NAME,
  databaseAndRoleFrom,
  deletePreviewBranch,
  previewBranchName,
  previewDatabaseUrl,
  requireEnv,
} from "../../scripts/neon-preview-branch.js";

const PROJECT_ID = "proj-test";
const PARENT_DATABASE_URL =
  "postgresql://app_owner:secret@ep-dev-pooler.neon.tech/appdb?sslmode=require";
const PREVIEW_URI = "postgresql://app_owner:secret@ep-preview-pooler/appdb";

type Branch = { id: string; name: string; default?: boolean };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

type FakeRequest = {
  method: string;
  path: string;
  body?: { branch: { name: string } };
  searchParams: URLSearchParams;
};

function parseFakeRequest(url: string, init: RequestInit): FakeRequest {
  const { pathname, searchParams } = new URL(url);
  return {
    method: init.method ?? "GET",
    path: pathname.replace(`/api/v2/projects/${PROJECT_ID}`, ""),
    body: init.body ? JSON.parse(String(init.body)) : undefined,
    searchParams,
  };
}

function fakeConnectionUri(searchParams: URLSearchParams) {
  const fields = ["branch_id", "database_name", "role_name", "pooled"].map(
    (field) => `${field}=${searchParams.get(field)}`,
  );
  return `${PREVIEW_URI}?${fields.join("&")}`;
}

// Serves the handful of Neon endpoints the script uses from an in-memory
// branch list, recording every request.
function createFakeNeon(initialBranches: Branch[]) {
  const branches = [...initialBranches];
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const routes: Record<string, (request: FakeRequest) => unknown> = {
    "GET /branches": ({ searchParams }) => ({
      branches: branches.filter((branch) =>
        branch.name.includes(searchParams.get("search") ?? ""),
      ),
    }),
    "POST /branches": ({ body }) => {
      const branch = { id: "br-new", name: body!.branch.name };
      branches.push(branch);
      return { branch };
    },
    "GET /connection_uri": ({ searchParams }) => ({
      uri: fakeConnectionUri(searchParams),
    }),
  };
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const request = parseFakeRequest(url, init);
    const { method, path, body } = request;
    requests.push({ method, path, body });
    if (method === "DELETE") {
      return jsonResponse({});
    }
    const route = routes[`${method} ${path}`];
    if (!route) {
      return jsonResponse({ message: "unexpected" }, 500);
    }
    return jsonResponse(route(request));
  });
  const client = createNeonClient({
    apiKey: "neon-key",
    projectId: PROJECT_ID,
    fetchImpl,
    sleep: async () => {},
  });
  return { client, requests, fetchImpl };
}

const PARENT_BRANCH = {
  id: "br-prod",
  name: PREVIEW_PARENT_BRANCH_NAME,
  default: true,
};

describe("previewDatabaseUrl", () => {
  it("creates preview/pr-<n> from the production branch and returns its pooled URI with the parent's database and role", async () => {
    const { client, requests } = createFakeNeon([
      { id: "br-dev", name: "development" },
      PARENT_BRANCH,
    ]);

    const uri = await previewDatabaseUrl(
      client,
      "preview/pr-42",
      PARENT_DATABASE_URL,
    );

    expect(uri).toBe(
      `${PREVIEW_URI}?branch_id=br-new&database_name=appdb&role_name=app_owner&pooled=true`,
    );
    const create = requests.find((request) => request.method === "POST");
    expect(create?.body).toEqual({
      branch: { name: "preview/pr-42", parent_id: "br-prod" },
      endpoints: [{ type: "read_write" }],
    });
  });

  it("reuses an existing preview branch on later pushes instead of creating another", async () => {
    const { client, requests } = createFakeNeon([
      PARENT_BRANCH,
      { id: "br-pr-42", name: "preview/pr-42" },
    ]);

    const uri = await previewDatabaseUrl(
      client,
      "preview/pr-42",
      PARENT_DATABASE_URL,
    );

    expect(uri).toContain("branch_id=br-pr-42");
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("matches the branch name exactly, so PR 4 doesn't reuse PR 42's branch", async () => {
    const { client } = createFakeNeon([
      PARENT_BRANCH,
      { id: "br-pr-42", name: "preview/pr-42" },
    ]);

    const uri = await previewDatabaseUrl(
      client,
      "preview/pr-4",
      PARENT_DATABASE_URL,
    );

    expect(uri).toContain("branch_id=br-new");
  });

  it("fails loud when the production parent branch is missing", async () => {
    const { client } = createFakeNeon([{ id: "br-dev", name: "development" }]);

    await expect(
      previewDatabaseUrl(client, "preview/pr-42", PARENT_DATABASE_URL),
    ).rejects.toThrow(`"${PREVIEW_PARENT_BRANCH_NAME}" not found`);
  });

  it("refuses to hand back the default branch even if it carries the preview name", async () => {
    const { client, requests } = createFakeNeon([
      { id: "br-prod", name: "preview/pr-42", default: true },
    ]);

    await expect(
      previewDatabaseUrl(client, "preview/pr-42", PARENT_DATABASE_URL),
    ).rejects.toThrow("default branch");
    expect(requests.some((request) => request.path === "/connection_uri")).toBe(
      false,
    );
  });
});

describe("deletePreviewBranch", () => {
  it("never deletes the default branch", async () => {
    const { client, requests } = createFakeNeon([
      { id: "br-prod", name: "preview/pr-42", default: true },
    ]);

    await expect(deletePreviewBranch(client, "preview/pr-42")).rejects.toThrow(
      "default branch",
    );
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });

  it("deletes only the PR's own preview branch", async () => {
    const { client, requests } = createFakeNeon([
      PARENT_BRANCH,
      { id: "br-pr-42", name: "preview/pr-42" },
      { id: "br-pr-4", name: "preview/pr-4" },
    ]);

    await expect(deletePreviewBranch(client, "preview/pr-4")).resolves.toBe(
      true,
    );

    const deletes = requests.filter((request) => request.method === "DELETE");
    expect(deletes).toEqual([
      { method: "DELETE", path: "/branches/br-pr-4", body: undefined },
    ]);
  });

  it("does nothing when the PR never got a preview branch", async () => {
    const { client, requests } = createFakeNeon([PARENT_BRANCH]);

    await expect(deletePreviewBranch(client, "preview/pr-42")).resolves.toBe(
      false,
    );
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });
});

describe("createNeonClient", () => {
  it("sends the API key as a bearer token", async () => {
    const { client, fetchImpl } = createFakeNeon([PARENT_BRANCH]);

    await client.findBranchByName(PREVIEW_PARENT_BRANCH_NAME);

    const init = fetchImpl.mock.calls[0]![1];
    expect(init.headers).toMatchObject({ Authorization: "Bearer neon-key" });
  });

  it("retries while the project is locked by a pending operation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 423))
      .mockResolvedValueOnce(jsonResponse({ uri: PREVIEW_URI }));
    const sleep = vi.fn(async () => {});
    const client = createNeonClient({
      apiKey: "neon-key",
      projectId: PROJECT_ID,
      fetchImpl,
      sleep,
    });

    await expect(
      client.getPooledConnectionUri({
        branchId: "br-new",
        databaseName: "appdb",
        roleName: "app_owner",
      }),
    ).resolves.toBe(PREVIEW_URI);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last locked attempt", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 423));
    const client = createNeonClient({
      apiKey: "neon-key",
      projectId: PROJECT_ID,
      fetchImpl,
      sleep: async () => {},
    });

    await expect(client.deleteBranch("br-new")).rejects.toThrow("HTTP 423");
    expect(fetchImpl).toHaveBeenCalledTimes(LOCKED_RETRY_ATTEMPTS);
  });

  it("throws with the status and body on any other error, without retrying", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: "bad key" }, 401),
    );
    const client = createNeonClient({
      apiKey: "neon-key",
      projectId: PROJECT_ID,
      fetchImpl,
      sleep: async () => {},
    });

    await expect(client.findBranchByName("x")).rejects.toThrow(
      /HTTP 401: .*bad key/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("helpers", () => {
  it("names deploy preview branches by PR number", () => {
    expect(
      previewBranchName({
        CONTEXT: "deploy-preview",
        REVIEW_ID: "42",
        BRANCH: "feature/x",
      }),
    ).toBe("preview/pr-42");
  });

  it("names branch deploy branches by git branch", () => {
    expect(
      previewBranchName({ CONTEXT: "branch-deploy", BRANCH: "feature/x" }),
    ).toBe("branch/feature/x");
  });

  it("refuses any other Netlify context, so production never gets a preview branch", () => {
    expect(() =>
      previewBranchName({ CONTEXT: "production", BRANCH: "main" }),
    ).toThrow('got "production"');
    expect(() => previewBranchName({ REVIEW_ID: "42" })).toThrow("CONTEXT");
  });

  it("requires the context's identifier", () => {
    expect(() => previewBranchName({ CONTEXT: "deploy-preview" })).toThrow(
      "REVIEW_ID is not set",
    );
    expect(() => previewBranchName({ CONTEXT: "branch-deploy" })).toThrow(
      "BRANCH is not set",
    );
  });

  it("reads the database and role from a connection URL", () => {
    expect(databaseAndRoleFrom(PARENT_DATABASE_URL)).toEqual({
      databaseName: "appdb",
      roleName: "app_owner",
    });
  });

  it("rejects missing and still-encrypted env values", () => {
    expect(requireEnv({ NEON_API_KEY: "key" }, "NEON_API_KEY")).toBe("key");
    expect(() => requireEnv({}, "NEON_API_KEY")).toThrow("not set");
    expect(() =>
      requireEnv({ NEON_API_KEY: "encrypted:abc" }, "NEON_API_KEY"),
    ).toThrow("still encrypted");
  });
});
