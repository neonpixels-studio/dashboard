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
    const response = await fetchImpl(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(
        `${options.vendorLabel} responded with ${response.status} ${response.statusText}.`,
      );
    }
    return (await response.json()) as ResponseBody;
  } finally {
    clearTimeout(timeoutId);
  }
}
