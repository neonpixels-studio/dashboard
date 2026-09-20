// Type-only — erased at build time, so this doesn't pull the Nuxt server
// bundle into this separately-built Netlify Function (see the file-level
// comment below on why this can't call the orchestrator in-process at all).
import type { SyncSummary } from "../../server/integrations/orchestrator";

// A Netlify Scheduled Function (https://docs.netlify.com/functions/scheduled-functions/),
// bundled independently of the Nuxt/Nitro app by Netlify's own Functions
// build step (default `netlify/functions/` directory, zero extra config).
//
// Why this instead of Nitro's `nitro.scheduledTasks`: that feature (see
// node_modules/nitropack/dist/runtime/internal/task.mjs's
// startScheduleRunner) schedules with an in-process `croner` timer, which
// only ever fires on a long-running server process. The netlify preset
// deploys the Nuxt app as a serverless Lambda-style function — invoked
// per-request and torn down, never idling in the background — so a croner
// timer registered inside it would never fire in production. This file is a
// second, separate Netlify Function whose only job is to exist on Netlify's
// own cron infrastructure and call the real orchestrator over HTTP.
//
// It deliberately does NOT run the orchestrator in-process either: useDb()
// and useRuntimeConfig() (server/db/index.ts, server/integrations/syncDeps.ts)
// are Nitro/Nuxt runtime auto-imports that don't exist in a plain Netlify
// Function's bundle. Calling POST /api/sync instead reuses the exact same
// code path as the manual trigger — see server/api/sync.post.ts — so there
// is only ever one implementation of "run a sync."
//
// Netlify resolves a scheduled function's cadence from the `config.schedule`
// literal below at build/deploy time (no env var interpolation — the value
// must be statically analyzable, so it can't read
// process.env.NUXT_SYNC_SCHEDULE_CRON at runtime). This constant is the one
// place to change it; a change here needs a redeploy to take effect.
const SYNC_SCHEDULE_CRON = "*/15 * * * *";

interface ScheduledFunctionConfig {
  schedule: string;
}

// Netlify injects the deployed site's own URL for every Function invocation
// (https://docs.netlify.com/functions/environment-variables/) — no separate
// env var to configure. Scheduled functions only run against the production
// deploy, so this is always the production site.
function requireSiteUrl(): string {
  const siteUrl = process.env.URL;
  if (!siteUrl) {
    throw new Error("scheduled-sync: process.env.URL is not set.");
  }
  return siteUrl;
}

function requireTriggerSecret(): string {
  const secret = process.env.NUXT_SYNC_TRIGGER_SECRET;
  if (!secret) {
    throw new Error("scheduled-sync: NUXT_SYNC_TRIGGER_SECRET is not set.");
  }
  return secret;
}

// Bounds how long one invocation waits on /api/sync. Deliberately *below*
// Netlify's default synchronous function execution limit (10s as of this
// writing) rather than some larger "generous" value — if it were longer,
// Netlify would kill the whole function first and this abort would never
// fire, defeating the point. /api/sync itself currently has no per-vendor
// timeout and awaits every enabled provider concurrently in one request
// (see server/integrations/orchestrator.ts's runSync), so as more providers
// land this ceiling gets tight — see this PR's follow-up suggestions for
// splitting that fan-out instead of just widening the number here.
const FETCH_TIMEOUT_MS = 9_000;

// Returns null (rather than throwing) when the request itself never
// completed — a DNS failure, TLS error, connection reset, or the
// FETCH_TIMEOUT_MS abort above. scheduledSync below treats that the same as
// a non-2xx response: log once, answer 502.
async function postSync(
  siteUrl: string,
  triggerSecret: string,
): Promise<Response | null> {
  try {
    return await fetch(new URL("/api/sync", siteUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${triggerSecret}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

// /api/sync answers 200 even when every enabled vendor failed — that's the
// correct per-vendor isolation behavior (see orchestrator.ts), not a
// transport problem, so this function's own response would otherwise report
// a healthy invocation for a total outage with nothing else watching for
// it. Parsed defensively: an unparseable body is treated as "can't tell",
// not as "everything failed".
async function allVendorsFailed(response: Response): Promise<boolean> {
  const summary: SyncSummary | null = await response.json().catch(() => null);
  const outcomes = summary?.outcomes ?? [];
  return outcomes.length > 0 && outcomes.every((outcome) => !outcome.ok);
}

export default async function scheduledSync(): Promise<Response> {
  const siteUrl = requireSiteUrl();
  const triggerSecret = requireTriggerSecret();

  const response = await postSync(siteUrl, triggerSecret);
  if (!response) {
    console.error("scheduled-sync: POST /api/sync did not complete");
    return new Response("sync trigger unreachable", { status: 502 });
  }

  // A non-2xx response here means /api/sync itself rejected or crashed the
  // request (bad/missing secret, unhandled error) — not an individual
  // vendor failure, which /api/sync isolates and still answers 200 for (see
  // server/integrations/orchestrator.ts). Surface that distinction in this
  // function's own status so Netlify's invocation log flags it.
  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    console.error(
      `scheduled-sync: POST /api/sync responded ${response.status}: ${body}`,
    );
    return new Response("sync trigger failed", { status: 502 });
  }

  if (await allVendorsFailed(response)) {
    console.error("scheduled-sync: every enabled integration failed");
    return new Response("every enabled integration failed", { status: 502 });
  }

  return new Response("ok", { status: 200 });
}

export const config: ScheduledFunctionConfig = { schedule: SYNC_SCHEDULE_CRON };
