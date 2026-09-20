// Shared HTTP-with-timeout seam for the three syndication platform clients
// (hashnodeClient.ts/devtoClient.ts/mediumClient.ts) — each made an
// AbortController + setTimeout + fetch + `!response.ok` check + JSON parse +
// `finally { clearTimeout }` independently before this existed (rule of
// three: same concern, three copies). Deliberately narrower than a general
// "fetch wrapper" for the whole server/integrations tree — Stripe/GA4 use
// their own SDKs, not raw fetch, so they have no equivalent duplication this
// needs to absorb.
const DEFAULT_TIMEOUT_MS = 20_000;

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  // Prefixes the thrown error on a non-ok response, e.g. "Hashnode API" or
  // "DEV.to API" — callers keep control of exactly what identifies the
  // failing request in that message.
  vendorLabel: string;
}

/**
 * Issues one fetch with an independent timeout (a hung request would
 * otherwise block a sync indefinitely — no independent deadline on a
 * Netlify function, same reasoning as
 * server/integrations/stripe/stripeClient.ts's STRIPE_REQUEST_TIMEOUT_MS),
 * throws a clear error on a non-ok response, and parses the body as JSON.
 * `fetchImpl` defaults to the global `fetch` but is injectable — this is
 * the seam every real syndication HTTP client builds its
 * `Fetch*Page`/`List*`/`Fetch*Info` function on top of.
 */
export async function fetchJson<ResponseBody>(
  url: string,
  options: FetchJsonOptions,
): Promise<ResponseBody> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await requestJson(
      url,
      options,
      abortController.signal,
      fetchImpl,
    );
    if (!response.ok) {
      throw new Error(
        `${options.vendorLabel} responded with ${response.status} ${response.statusText}.`,
      );
    }
    return await parseJsonBody<ResponseBody>(response, options.vendorLabel);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Isolated so its catch block only ever wraps fetchImpl's own failure modes
// (a network error, or the timeout above firing and aborting the signal) —
// never a `!response.ok` throw from the caller, which already carries its
// own clear, vendor-labeled message and shouldn't be re-wrapped.
async function requestJson(
  url: string,
  options: FetchJsonOptions,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal,
    });
  } catch (cause) {
    // A generic AbortError ("This operation was aborted") or network error
    // doesn't say which vendor or URL failed — every other throw in this
    // package (each client's own errors, mapping.ts's parse failures) is
    // already labeled, so this is too.
    throw new Error(`${options.vendorLabel} request to ${url} failed.`, {
      cause,
    });
  }
}

async function parseJsonBody<ResponseBody>(
  response: Response,
  vendorLabel: string,
): Promise<ResponseBody> {
  try {
    return (await response.json()) as ResponseBody;
  } catch (cause) {
    throw new Error(`${vendorLabel} returned a body that isn't valid JSON.`, {
      cause,
    });
  }
}
