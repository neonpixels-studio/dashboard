// Shared test-only fake `fetch` that synchronously checks whether the
// signal it was called with is ALREADY aborted (unlike hangingFetch.ts,
// which only aborts later, in response to an "abort" event) — real `fetch`
// rejects immediately when handed an already-aborted signal, which is
// exactly the shape an already-exhausted FetchDeadline (see
// deadlineFixtures.ts's createExhaustedDeadline) produces once combined via
// `AbortSignal.any`. Used across the DEV.to/Hashnode/Medium/Sentry provider
// wiring tests (rule of three: same concern, many copies before this
// existed) to prove a provider actually threads its `deadline` argument
// down to the real client, rather than silently ignoring it. Lives
// alongside hangingFetch.ts/httpFixtures.ts as this package's other
// test-support seams.
export function createAbortAwareFetch(respond: () => Response): typeof fetch {
  return ((_url: unknown, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      return Promise.reject(
        new DOMException("This operation was aborted", "AbortError"),
      );
    }
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
}
