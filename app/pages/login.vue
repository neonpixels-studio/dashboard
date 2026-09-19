<template>
  <div class="auth">
    <div class="brand-panel">
      <div class="brand-row">
        <BrandMark :size="20" />
        <span class="brand-name">NEONPIXELS</span>
      </div>

      <div class="pitch">
        <div class="kicker-row">
          <span class="kicker-dash" aria-hidden="true"></span>
          <span class="kicker-text"
            >ONE HUMAN · ONE AGENT · SIX PROPERTIES</span
          >
        </div>
        <h1 class="headline display-num">
          EVERY<br />NUMBER,<br /><span class="gradient">ONE PAGE</span>
        </h1>
        <p class="pitch-copy">
          Google Analytics, Clerk, Stripe, Sentry and four blogging platforms,
          pulled into a single console. Stop opening eight tabs to answer one
          question.
        </p>
      </div>

      <ul class="property-pills">
        <li
          v-for="app in propertyPills"
          :key="app.slug"
          class="pill"
          :style="{
            color: app.accent,
            borderColor: `color-mix(in srgb, ${app.accent} 25%, transparent)`,
          }"
        >
          <span
            class="pill-dot"
            :style="{ background: app.accent }"
            aria-hidden="true"
          ></span>
          {{ app.name }}
        </li>
      </ul>
    </div>

    <div class="auth-panel">
      <div class="auth-inner">
        <div class="auth-copy">
          <h2 class="auth-title display-num">Sign in</h2>
          <p class="auth-lead">Continue to Neon Pixels Control.</p>
        </div>
        <SignIn fallback-redirect-url="/" :appearance="clerkAppearance" />
      </div>
      <ul class="auth-footer">
        <li><a href="#privacy">Privacy</a></li>
        <li><a href="#terms">Terms</a></li>
        <li><a href="#status">Status</a></li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { APPS } from "~/config/apps";

useHead({ title: "Sign in · Neon Pixels Control" });

const propertyPills = APPS.filter((app) => !app.isStudioSite);

// Ink matches --ink from the design system so the Clerk card reads as one piece
// with the rest of the page.
const INK = "#F2F2F5";

// This Clerk version doesn't reliably theme the header, labels, divider and
// footer text through appearance.variables (they derive from colorNeutral,
// which isn't honored here — that's why those render dark). Setting the color on
// each element directly is version-proof.
const clerkAppearance = {
  variables: {
    colorPrimary: "#B4F03C",
    colorBackground: "#101014",
    colorInputBackground: "#101014",
    colorText: INK,
    colorTextSecondary: "#9A9AA8",
    colorInputText: INK,
    colorDanger: "#FF6B6B",
    borderRadius: "8px",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  elements: {
    headerTitle: { color: INK },
    headerSubtitle: { color: INK },
    formHeaderTitle: { color: INK },
    formHeaderSubtitle: { color: INK },
    formFieldLabel: { color: INK },
    formFieldInputShowPasswordButton: { color: INK },
    identityPreviewText: { color: INK },
    dividerText: { color: INK },
    footerActionText: { color: INK },
    footer: { color: INK },
  },
};
</script>

<style scoped>
.auth {
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  background: var(--bg);
  color: var(--ink);
  display: flex;
}
.brand-panel {
  width: 44%;
  max-width: 640px;
  flex-shrink: 0;
  padding: 52px 56px;
  background: var(--bg-2);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-name {
  font-family: var(--display);
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.01em;
}
.pitch {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.kicker-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.kicker-dash {
  width: 26px;
  height: 2px;
  background: var(--accent);
}
.kicker-text {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.24em;
  color: var(--ink-2);
}
.headline {
  margin: 0;
  font-size: clamp(48px, 5vw, 72px);
  line-height: 0.92;
  letter-spacing: -0.045em;
}
.gradient {
  background-image: linear-gradient(
    94deg,
    #b4f03c 0%,
    #22d3ee 34%,
    #7b8cff 62%,
    #ff3ea5 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.pitch-copy {
  margin: 0;
  max-width: 430px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-2);
}
.property-pills {
  margin: auto 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border: 1px solid;
  border-radius: var(--r-sm);
  font-size: 11px;
}
.pill-dot {
  width: 5px;
  height: 5px;
}
.auth-panel {
  flex-grow: 1;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
}
.auth-inner {
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.auth-copy {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.auth-title {
  margin: 0;
  font-size: 30px;
}
.auth-lead {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}
.auth-footer {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  justify-content: center;
  gap: 18px;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}
.auth-footer a:hover {
  color: var(--ink);
}
</style>

<!--
  Clerk renders its widget into the page (no shadow DOM), but its own injected
  styles win over the appearance API for a few elements in this version, so we
  target the stable .cl-* classes here. !important is needed because Clerk's
  runtime styles land after these. This block is intentionally global (unscoped)
  since scoped attributes never reach Clerk's markup.
-->
<style>
/* --on-accent: dark ink on the lime CTA; white-on-lime is too low-contrast. */
.cl-formButtonPrimary {
  color: #08080a !important;
}
/* --ink: the verification-code boxes share the card background, so without an
   explicit border they read as borderless. */
.cl-otpCodeFieldInput {
  border: 1px solid #f2f2f5 !important;
}
</style>
