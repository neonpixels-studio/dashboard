import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXIT_FAILURE = 1;

// Comparing `import.meta.url` against `pathToFileURL(process.argv[1])`
// directly would fail open on a symlinked path (e.g. macOS's /tmp ->
// /private/tmp) — `import.meta.url` resolves to the real path, but
// `process.argv[1]` doesn't get symlinks resolved, so the two would silently
// mismatch and `main()` would never run. Resolving both through
// `realpathSync` first closes that.
function isDirectInvocation(moduleUrl) {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }
  return realpathSync(entrypoint) === fileURLToPath(moduleUrl);
}

// Runs a script's `main()` only when the file is executed directly (not when a
// test imports it), exiting non-zero with the error message on failure.
export function runIfDirectInvocation(moduleUrl, main, scriptName) {
  if (!isDirectInvocation(moduleUrl)) {
    return;
  }
  main().catch((error) => {
    console.error(`${scriptName} failed: ${error.message}`);
    process.exit(EXIT_FAILURE);
  });
}
