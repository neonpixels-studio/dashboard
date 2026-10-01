// Source-map leak guard. Fails the build if any `.map` file remains under the
// published directory after `nuxt build`. @sentry/nuxt's
// `filesToDeleteAfterUpload` (nuxt.config.ts) is meant to delete them, but that
// was only ever verified by hand; this makes it a permanent regression check.
//
// The publish directory is read from netlify.toml's `[build] publish`, so the
// guard follows whatever Netlify actually serves. Server-side function bundles
// (.netlify/) are not published and are out of scope.
//
// Usage (see netlify.toml build commands):
//   node scripts/assert-no-sourcemaps.js [path/to/netlify.toml]

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXIT_FAILURE = 1;
const SOURCE_MAP_EXTENSION = ".map";
const BUILD_SECTION_PATTERN = /^\[build\]\s*$/;
const ANY_SECTION_PATTERN = /^\[.+\]\s*$/;
const PUBLISH_PATTERN = /^publish\s*=\s*"([^"]+)"/;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_NETLIFY_TOML = join(REPO_ROOT, "netlify.toml");

// Only the top-level `[build]` table matters; `[context.*]` tables never
// override `publish` here, and a hand-rolled scan avoids adding a TOML parser.
export function parsePublishDir(tomlContents) {
  let insideBuildSection = false;
  for (const rawLine of tomlContents.split("\n")) {
    const line = rawLine.trim();
    if (ANY_SECTION_PATTERN.test(line)) {
      insideBuildSection = BUILD_SECTION_PATTERN.test(line);
      continue;
    }
    const match = insideBuildSection ? line.match(PUBLISH_PATTERN) : null;
    if (match) {
      return match[1];
    }
  }
  throw new Error(
    "No `publish` directory found under [build] in netlify.toml.",
  );
}

export function findSourceMaps(publishDirectory) {
  if (!existsSync(publishDirectory)) {
    throw new Error(
      `Publish directory ${publishDirectory} does not exist; did \`nuxt build\` run?`,
    );
  }
  return readdirSync(publishDirectory, { recursive: true })
    .filter((entry) => entry.endsWith(SOURCE_MAP_EXTENSION))
    .sort();
}

function reportLeaks(publishDirectory, leakedFiles) {
  console.error(
    `Found ${leakedFiles.length} source map(s) under ${publishDirectory}, which Netlify publishes publicly:`,
  );
  for (const leakedFile of leakedFiles) {
    console.error(`  - ${join(publishDirectory, leakedFile)}`);
  }
  console.error(
    'Check sentry.sourcemaps.filesToDeleteAfterUpload in nuxt.config.ts (expected "dist/**/*.map").',
  );
}

// Returns the process exit code so the pass/fail decision is testable without
// spawning a process.
export function runGuard(netlifyTomlPath = DEFAULT_NETLIFY_TOML) {
  const publishDirectory = resolve(
    dirname(netlifyTomlPath),
    parsePublishDir(readFileSync(netlifyTomlPath, "utf8")),
  );
  const leakedFiles = findSourceMaps(publishDirectory);
  if (leakedFiles.length) {
    reportLeaks(publishDirectory, leakedFiles);
    return EXIT_FAILURE;
  }
  console.log(`No source maps under ${publishDirectory}.`);
  return 0;
}

// Resolve both sides through realpathSync so a symlinked argv[1] (macOS
// /tmp -> /private/tmp) can't make this silently never run and exit 0.
function isDirectInvocation() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }
  return realpathSync(entrypoint) === fileURLToPath(import.meta.url);
}

if (isDirectInvocation()) {
  try {
    process.exit(runGuard(process.argv[2]));
  } catch (error) {
    console.error(`assert-no-sourcemaps failed: ${error.message}`);
    process.exit(EXIT_FAILURE);
  }
}
