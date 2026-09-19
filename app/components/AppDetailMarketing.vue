<template>
  <div class="detail-body">
    <div class="tile-grid">
      <MetricTile
        label="SESSIONS"
        value="6,104"
        delta="▲ 7%"
        sub="4,782 unique users"
      />
      <MetricTile
        label="OUTBOUND CLICKS"
        value="1,475"
        delta="▲ 19%"
        sub="24.2% of sessions click through"
      />
      <MetricTile
        label="AVG ENGAGED TIME"
        value="1:42"
        delta="flat"
        delta-tone="muted"
        sub="single-page site"
      />
      <MetricTile
        label="SENTRY"
        value="0"
        delta="open issues"
        delta-tone="muted"
        sub="quiet for 41 days"
        tone="ok"
      />
    </div>

    <div class="mid-row">
      <div class="card sessions-panel">
        <div class="panel-head">
          <span class="panel-title">Sessions</span>
          <span class="panel-meta">GOOGLE ANALYTICS · DAILY</span>
          <span class="grow"></span>
          <span class="panel-note">peak 341 on 06 SEP</span>
        </div>
        <SparkLine
          :path="SESSIONS_PATH"
          width="100%"
          :height="130"
          view-box="0 0 600 130"
          :color="sessionsColor"
          :stroke-width="2.4"
          filled
          :fill-color="`color-mix(in srgb, ${sessionsColor} 7%, transparent)`"
          :grid-lines="[12, 51, 90, 129]"
          :aria-label="`${app.name} daily sessions over the last 30 days`"
        />
        <AxisRow />
      </div>

      <div class="card outbound-panel">
        <div class="panel-head">
          <span class="panel-title">Outbound clicks by project</span>
          <span class="grow"></span>
          <span class="panel-meta">1,475 TOTAL</span>
        </div>
        <div class="outbound-bars">
          <BarMeter
            v-for="row in outboundRows"
            :key="row.label"
            :label="row.label"
            :value="row.value"
            :pct-label="row.pctLabel"
            :pct="row.pct"
            :color="row.color"
            swatch
          />
        </div>
        <div class="hint-note">
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.4" stroke="#82828F" stroke-width="1.4" />
            <path
              d="M8 7.2v4"
              stroke="#82828F"
              stroke-width="1.4"
              stroke-linecap="round"
            />
            <circle cx="8" cy="4.9" r="0.8" fill="#82828F" />
          </svg>
          <span>
            danholloran.me is linked from the footer only and drew 0 outbound
            clicks. Worth a card in the grid.
          </span>
        </div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="card bottom-card">
        <span class="metric-label">TRAFFIC SOURCES</span>
        <StatList
          :items="[
            { label: 'Direct', value: '38%' },
            { label: 'bsky.app', value: '24%' },
            { label: 'github.com', value: '21%' },
            { label: 'Organic search', value: '17%' },
          ]"
        />
      </div>
      <div class="card bottom-card">
        <span class="metric-label">DEVICE</span>
        <StatList
          :items="[
            { label: 'Desktop', value: '71%' },
            { label: 'Mobile', value: '26%' },
            { label: 'Tablet', value: '3%' },
            { label: 'Prefers dark', value: '83%', muted: true },
          ]"
        />
      </div>
      <div class="card bottom-card">
        <span class="metric-label">DEPLOYS</span>
        <ul class="deploys">
          <li v-for="deploy in DEPLOYS" :key="deploy.date + deploy.text">
            <span class="deploy-date">{{ deploy.date }}</span>
            <span class="deploy-text">{{ deploy.text }}</span>
            <span
              class="deploy-dot"
              :class="deploy.tone"
              aria-hidden="true"
            ></span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { findAppBySlug, type DashboardApp } from "~/config/apps";

const props = defineProps<{ app: DashboardApp }>();

// The studio site charts sessions in neutral white; product properties use
// their own accent.
const sessionsColor = computed(() =>
  props.app.isStudioSite ? "var(--ink)" : props.app.accent,
);

const SESSIONS_PATH =
  "M0 26.8 C3.4 26.4 13.8 23.3 20.7 24.5 C27.6 25.7 34.5 34.7 41.4 34 C48.3 33.3 55.2 24 62.1 20.3 C69 16.6 75.9 11.3 82.8 12 C89.7 12.7 96.5 19.8 103.4 24.3 C110.3 28.8 117.2 34.6 124.1 38.8 C131 43 137.9 50.8 144.8 49.4 C151.7 48 158.6 31.4 165.5 30.6 C172.4 29.8 179.3 39.8 186.2 44.4 C193.1 49 200 53.9 206.9 58.3 C213.8 62.6 220.7 71.6 227.6 70.5 C234.5 69.4 241.4 54.5 248.3 51.5 C255.2 48.5 262.1 54.2 269 52.3 C275.9 50.4 282.8 40.5 289.7 40.1 C296.6 39.7 303.4 45.7 310.3 50 C317.2 54.3 324.1 60.7 331 65.9 C337.9 71.1 344.8 76.7 351.7 81.3 C358.6 85.9 365.5 93.7 372.4 93.4 C379.3 93.1 386.2 82.9 393.1 79.7 C400 76.5 406.9 73.3 413.8 74.3 C420.7 75.3 427.6 81.9 434.5 85.8 C441.4 89.7 448.3 94.8 455.2 97.4 C462.1 100 469 99.7 475.9 101.5 C482.8 103.3 489.7 105.5 496.6 108.2 C503.5 111 510.3 117.8 517.2 118 C524.1 118.2 531 109.9 537.9 109.5 C544.8 109.1 551.7 117.6 558.6 115.7 C565.5 113.8 572.4 103.5 579.3 98 C586.2 92.5 596.5 85.5 600 83";

const OUTBOUND_CLICKS = [
  { slug: "grimicorn", value: "612", pct: 41 },
  { slug: "wanderist", value: "388", pct: 26 },
  { slug: "basin", value: "274", pct: 19 },
  { slug: "markpost", value: "201", pct: 14 },
];

const outboundRows = OUTBOUND_CLICKS.flatMap((click) => {
  const target = findAppBySlug(click.slug);
  if (!target) {
    return [];
  }
  return [
    {
      label: target.name,
      color: target.accent,
      value: click.value,
      pct: click.pct,
      pctLabel: `${click.pct}%`,
    },
  ];
});

const DEPLOYS = [
  { date: "19 SEP", text: "copy tweak on hero", tone: "ok" },
  { date: "14 SEP", text: "add markpost card", tone: "ok" },
  { date: "09 SEP", text: "og image regen", tone: "ok" },
  { date: "06 SEP", text: "font subset build", tone: "warn" },
];
</script>

<style scoped>
.detail-body {
  flex-grow: 1;
  padding: 22px 32px 26px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.mid-row {
  display: flex;
  gap: 16px;
}
.sessions-panel {
  flex: 3;
  min-width: 0;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.outbound-panel {
  flex: 2;
  min-width: 0;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.panel-note {
  font-size: 10px;
  color: var(--ink-3);
}
.outbound-bars {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.hint-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: auto;
  padding: 11px 13px;
  background: var(--surface-2);
  border-radius: var(--r);
  font-size: 11px;
  line-height: 1.55;
  color: var(--ink-2);
}
.hint-note svg {
  margin-top: 1px;
  flex: none;
}
.bottom-row {
  display: flex;
  gap: 16px;
}
.bottom-card {
  flex: 1;
  min-width: 0;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.deploys {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.deploys li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
}
.deploys li:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.deploy-date {
  width: 56px;
  font-size: 10px;
  color: var(--ink-3);
}
.deploy-text {
  flex-grow: 1;
  font-size: 11px;
}
.deploy-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  align-self: center;
}
.deploy-dot.ok {
  background: var(--ok);
}
.deploy-dot.warn {
  background: var(--warn);
}
</style>
