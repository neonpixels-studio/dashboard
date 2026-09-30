// Shared test-only fake `fetch` that never settles on its own — it only
// rejects once whichever AbortSignal it was called with fires — used across
// sentryClient.test.ts (its own request timeout, and the shared run-budget
// deadline) and syndication/httpClient.test.ts (the shared run-budget
// deadline) to simulate a genuinely stalled request (rule of three: same
// concern, three copies before this existed). Lives alongside
// httpFixtures.ts/loadFixture.ts/testConfig.ts as this package's other
// test-support seams.
export function createHangingFetch(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("This operation was aborted", "AbortError"));
      });
    });
  }) as unknown as typeof fetch;
}
