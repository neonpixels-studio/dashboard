import { readBody } from "h3";
import { useDb } from "../../db";
import {
  findIntegrationConfig,
  persistProviderResult,
  recordSyncStatus,
} from "../../integrations/persist";
import {
  HASHNODE_VENDOR,
  HashnodeIngestValidationError,
  parseHashnodeIngestPayload,
  toHashnodeProviderResult,
} from "../../integrations/syndication/hashnode/ingest";
import type { HashnodeIngestPayload } from "../../integrations/syndication/hashnode/ingest";
import { reportError } from "../../utils/errorReporting";
import { requireBearerSecret } from "../../utils/syncTrigger";

interface HashnodeIngestSummary {
  app: string;
  posts: number;
  views: number;
}

function parseOrReject(body: unknown): HashnodeIngestPayload {
  try {
    return parseHashnodeIngestPayload(body);
  } catch (error) {
    if (error instanceof HashnodeIngestValidationError) {
      throw createError({ statusCode: 400, statusMessage: error.message });
    }
    throw error;
  }
}

function summarize(payload: HashnodeIngestPayload): HashnodeIngestSummary {
  return {
    app: payload.app,
    posts: payload.posts.length,
    views: payload.posts.reduce((total, post) => total + post.views, 0),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Push-based counterpart to the orchestrator's poll: the Mac Mini's
// hashnode-stats skill POSTs the full post list here (see
// server/integrations/syndication/hashnode/ingest.ts for why). The app's
// hashnode integration_config row must exist but stays `enabled = false`, so
// the scheduled sync never polls Hashnode's paid GraphQL API.
// @todo the stale-vendor alert only judges enabled rows, so nothing alerts if
// the scraper stops pushing; the sync_status row this writes is the place to
// hang that check.
export default defineEventHandler(
  async (event): Promise<HashnodeIngestSummary> => {
    requireBearerSecret(event, useRuntimeConfig().hashnodeIngestSecret);
    const payload = parseOrReject(await readBody(event));

    const db = useDb();
    const configRow = await findIntegrationConfig(
      db,
      payload.app,
      HASHNODE_VENDOR,
    );
    if (!configRow) {
      throw createError({
        statusCode: 404,
        statusMessage: `No hashnode integration_config row for "${payload.app}".`,
      });
    }

    const runAt = new Date();
    try {
      await persistProviderResult(
        db,
        configRow,
        toHashnodeProviderResult(payload),
      );
    } catch (error) {
      await recordSyncStatus(db, {
        slug: payload.app,
        vendor: HASHNODE_VENDOR,
        runAt,
        ok: false,
        error: errorMessage(error),
      }).catch((statusError) =>
        reportError("ingest: hashnode sync_status write failed", statusError),
      );
      throw error;
    }
    await recordSyncStatus(db, {
      slug: payload.app,
      vendor: HASHNODE_VENDOR,
      runAt,
      ok: true,
      error: null,
    });
    return summarize(payload);
  },
);
