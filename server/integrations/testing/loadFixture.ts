import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Read into a local before passing to `new URL()` — inlining `import.meta.url`
// directly as the second argument resolves to a non-file-scheme value under
// Vitest's SSR transform, which then throws in fileURLToPath.
const moduleUrl = import.meta.url;
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures", moduleUrl));

// Both arguments are joined straight into a filesystem path; without this,
// a value like "../../secrets" would escape FIXTURES_DIRECTORY.
const FIXTURE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function assertSafeFixtureSegment(segment: string, label: string): void {
  if (!FIXTURE_SEGMENT_PATTERN.test(segment)) {
    throw new Error(
      `Invalid fixture ${label} "${segment}": must match ${FIXTURE_SEGMENT_PATTERN}.`,
    );
  }
}

/**
 * Loads a recorded vendor response from server/integrations/testing/fixtures
 * so a provider's fetch() can be exercised against real-shaped data without
 * a network call. Each vendor gets its own subdirectory
 * (fixtures/<vendor>/<fixtureName>.json); a new provider records its
 * fixtures there and reuses this helper rather than hand-rolling file I/O.
 */
export async function loadFixture<FixtureShape>(
  vendor: string,
  fixtureName: string,
): Promise<FixtureShape> {
  assertSafeFixtureSegment(vendor, "vendor");
  assertSafeFixtureSegment(fixtureName, "fixtureName");

  const fixturePath = join(FIXTURES_DIRECTORY, vendor, `${fixtureName}.json`);

  let fileContents: string;
  try {
    fileContents = await readFile(fixturePath, "utf8");
  } catch (cause) {
    throw new Error(`Failed to read fixture at ${fixturePath}`, { cause });
  }

  try {
    return JSON.parse(fileContents) as FixtureShape;
  } catch (cause) {
    throw new Error(`Failed to parse fixture at ${fixturePath} as JSON`, {
      cause,
    });
  }
}
