// Shared test-only helper for faking a `fetch` Response — used by every
// syndication client test (hashnodeClient/devtoClient/mediumClient) instead
// of each redeclaring the same minimal Response shape (rule of three: same
// concern, three copies before this existed). Lives alongside
// loadFixture.ts/testConfig.ts as this package's other test-support seams.
export function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}
