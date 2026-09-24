import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// `provider_id` is the Clerk user id. Rows are keyed by an internal serial id so
// future foreign keys point at our own identifier rather than a vendor one.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Every table below is keyed by `slug`, matching `app/config/apps.ts`'s
// `DashboardApp.slug` by convention — never a foreign key, so this schema
// never imports app config and app config never imports the DB.

// The fixed set of third-party integrations a property can wire up. Kept
// narrow and enum-typed because `integration_config` is the source of truth
// for which vendors are configurable at all; sources that only ever produce
// metrics (e.g. GitHub issue counts) are NOT in this enum and use the
// free-text `vendor` column on `metric_snapshot`/`sync_status` instead.
export const integrationVendor = pgEnum("integration_vendor", [
  "ga4",
  "stripe",
  "clerk",
  "sentry",
  "medium",
  "hashnode",
  "devto",
]);

export const syndicationStatus = pgEnum("syndication_status", [
  "synced",
  "pending",
  "failed",
]);

// One row per (slug, vendor). A configured secret is either `secretRef` — the
// name of a shared studio env var already read at runtime (e.g.
// "NUXT_SENTRY_AUTH_TOKEN") — or `encryptedSecret`, an AES-256-GCM blob from
// server/utils/integrationSecrets.ts for a per-app override that has no
// dedicated env var. At most one is set per row; neither is required.
export const integrationConfig = pgTable(
  "integration_config",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    vendor: integrationVendor("vendor").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    // e.g. a GA4 property id or a Sentry project slug.
    externalId: text("external_id"),
    secretRef: text("secret_ref"),
    encryptedSecret: text("encrypted_secret"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("integration_config_slug_vendor_idx").on(
      table.slug,
      table.vendor,
    ),
    // Enforces the "at most one secret source" rule from the comment above —
    // a row must not carry both a secret_ref and an encrypted_secret. `enabled`
    // deliberately does NOT require either to be set: most vendors (ga4,
    // stripe, sentry, medium, hashnode, devto) authenticate with a single
    // shared studio-wide env var the poller reads directly by vendor name
    // (see .env.example), so only `externalId` varies per row. `secretRef`
    // only applies to a vendor whose credential genuinely varies per app,
    // e.g. clerk's NUXT_CLERK_SECRET_KEY_<SLUG>.
    check(
      "integration_config_single_secret",
      sql`num_nonnulls(${table.secretRef}, ${table.encryptedSecret}) <= 1`,
    ),
  ],
);

// Time-series numeric metrics, backing both current-value tiles and
// sparklines. `vendor` is free text (not `integrationVendor`) because a
// metric can come from a source that isn't a configurable integration, e.g.
// `open_issues` from GitHub.
export const metricSnapshot = pgTable(
  "metric_snapshot",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    vendor: text("vendor").notNull(),
    // e.g. mrr, active_subscribers, sessions, open_issues, users, posts.
    metric: text("metric").notNull(),
    // `mode: "number"` — otherwise Drizzle returns numeric columns as
    // strings, and every downstream comparison/aggregation over `value`
    // silently does the wrong thing (string concatenation, lexicographic
    // ordering) instead of throwing. precision 15 / scale 4 caps the
    // unscaled value at 10^11, comfortably under Number.MAX_SAFE_INTEGER
    // (~9 * 10^15), so `mode: "number"` can't round a stored value.
    value: numeric("value", {
      precision: 15,
      scale: 4,
      mode: "number",
    }).notNull(),
    // e.g. "30d", "current".
    period: text("period").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Tiles and sparklines both read "latest N rows for (slug, metric)
    // ordered by captured_at" — one composite index serves that directly and
    // still covers slug-only lookups via its leftmost prefix.
    index("metric_snapshot_slug_metric_captured_at_idx").on(
      table.slug,
      table.metric,
      table.capturedAt.desc(),
    ),
    // A row is uniquely identified by (slug, vendor, metric, period,
    // captured_at) — e.g. GA4's PERIOD_DAILY backfill in
    // server/integrations/ga4/provider.ts re-reports up to 30 prior days
    // every sync, each with its calendar day as `capturedAt`, not the sync
    // time. Without this, a re-sync duplicate-inserts every one of those
    // rows instead of updating them in place (see persist.ts's upsert on
    // this key, mirroring syndication_post's precedent).
    uniqueIndex("metric_snapshot_slug_vendor_metric_period_captured_at_idx").on(
      table.slug,
      table.vendor,
      table.metric,
      table.period,
      table.capturedAt,
    ),
  ],
);

// GA4 channel split (direct, organic, referral, ...) for one property at one
// point in time.
export const trafficBreakdown = pgTable(
  "traffic_breakdown",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    channel: text("channel").notNull(),
    // Same `mode: "number"` reasoning as metric_snapshot.value, with an
    // explicit precision/scale and range check since this is always a
    // percentage.
    pct: numeric("pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Same reasoning as metric_snapshot: reads want the latest breakdown for
    // one slug, so the composite serves that plus slug-only prefix lookups.
    index("traffic_breakdown_slug_captured_at_idx").on(
      table.slug,
      table.capturedAt.desc(),
    ),
    check(
      "traffic_breakdown_pct_range",
      sql`${table.pct} >= 0 AND ${table.pct} <= 100`,
    ),
  ],
);

// Per-post cross-post status for the writing app's syndication targets
// (Medium, Hashnode, DEV, ...). `postRef` identifies which local post a row
// is about, so a row is uniquely identified by (slug, platform, postRef) —
// a re-sync of the same post/platform pair should update this row, not
// insert a duplicate.
export const syndicationPost = pgTable(
  "syndication_post",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    platform: text("platform").notNull(),
    postRef: text("post_ref").notNull(),
    status: syndicationStatus("status").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("syndication_post_slug_platform_post_ref_idx").on(
      table.slug,
      table.platform,
      table.postRef,
    ),
  ],
);

// One row per (slug, vendor), overwritten on every poll. Powers "SYNCED Xm
// ago" and the integration health chips. `vendor` is free text like
// `metric_snapshot`, so it can also track sync health for sources that never
// get an `integration_config` row.
export const syncStatus = pgTable(
  "sync_status",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    vendor: text("vendor").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    ok: boolean("ok").notNull().default(false),
    // Rendered directly in the health chips — the poller that writes this
    // MUST NOT store a raw upstream error. Vendor SDK errors routinely echo
    // the failing request (API keys/tokens in URLs or headers); write a
    // short, redacted message only.
    error: text("error"),
  },
  (table) => [
    uniqueIndex("sync_status_slug_vendor_idx").on(table.slug, table.vendor),
  ],
);
