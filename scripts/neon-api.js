// Minimal Neon API client for the preview-branch script. `fetchImpl` and
// `sleep` are injectable so the request/retry logic is testable without
// touching the real API.

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
// Neon answers 423 while a previous operation on the project (e.g. the branch
// create that just ran) is still in progress; the same call succeeds once it
// finishes.
const HTTP_LOCKED = 423;
export const LOCKED_RETRY_ATTEMPTS = 5;
const LOCKED_RETRY_DELAY_MS = 2000;

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createNeonClient({
  apiKey,
  projectId,
  fetchImpl = fetch,
  sleep = defaultSleep,
}) {
  const projectUrl = `${NEON_API_BASE_URL}/projects/${projectId}`;

  async function send(method, path, body) {
    return fetchImpl(`${projectUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function request(method, path, body) {
    for (let attempt = 1; attempt <= LOCKED_RETRY_ATTEMPTS; attempt++) {
      const response = await send(method, path, body);
      if (response.ok) {
        return response.json();
      }
      if (response.status === HTTP_LOCKED && attempt < LOCKED_RETRY_ATTEMPTS) {
        await sleep(LOCKED_RETRY_DELAY_MS * attempt);
        continue;
      }
      const detail = await response.text();
      throw new Error(
        `Neon API ${method} ${path} failed with HTTP ${response.status}: ${detail}`,
      );
    }
    throw new Error(`Neon API ${method} ${path} stayed locked`);
  }

  return {
    async findBranchByName(name) {
      const query = new URLSearchParams({ search: name });
      const { branches } = await request("GET", `/branches?${query}`);
      // `search` is a substring match, so "preview/pr-1" also returns pr-12.
      return branches.find((branch) => branch.name === name) ?? null;
    },

    async createBranch({ name, parentId }) {
      const { branch } = await request("POST", "/branches", {
        branch: { name, parent_id: parentId },
        endpoints: [{ type: "read_write" }],
      });
      return branch;
    },

    async deleteBranch(branchId) {
      await request("DELETE", `/branches/${branchId}`);
    },

    async getPooledConnectionUri({ branchId, databaseName, roleName }) {
      const query = new URLSearchParams({
        branch_id: branchId,
        database_name: databaseName,
        role_name: roleName,
        pooled: "true",
      });
      const { uri } = await request("GET", `/connection_uri?${query}`);
      return uri;
    },
  };
}
