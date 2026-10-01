import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  findSourceMaps,
  parsePublishDir,
  runGuard,
} from "../../scripts/assert-no-sourcemaps.js";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/assert-no-sourcemaps.js");
const NETLIFY_TOML = `[build]
  command = "npm run build"
  publish = "out"

[context.deploy-preview]
  publish = "ignored"
`;

let projectDirectory: string;

function writeProjectFile(relativePath: string, contents = "x") {
  const filePath = join(projectDirectory, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), "sourcemap-guard-"));
  writeProjectFile("netlify.toml", NETLIFY_TOML);
});

afterEach(() => {
  rmSync(projectDirectory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("parsePublishDir", () => {
  it("reads publish from the [build] table only", () => {
    expect(parsePublishDir(NETLIFY_TOML)).toBe("out");
  });

  it("ignores publish in other tables", () => {
    expect(() => parsePublishDir('[other]\npublish = "x"\n')).toThrow(
      /No `publish`/,
    );
  });

  it("returns the [build] publish when a context table precedes it", () => {
    expect(
      parsePublishDir('[context.x]\npublish = "a"\n[build]\npublish = "b"'),
    ).toBe("b");
  });

  it("does not read publish from a nested [build.*] table", () => {
    expect(() =>
      parsePublishDir('[build]\n[build.environment]\npublish = "a"'),
    ).toThrow(/No `publish`/);
  });

  it("stops at [[array]] tables and tolerates trailing header comments", () => {
    expect(
      parsePublishDir(
        '[build] # main\npublish = "b"\n[[plugins]]\npublish = "c"',
      ),
    ).toBe("b");
    expect(() =>
      parsePublishDir('[build]\n[context.production] # x\npublish = "c"'),
    ).toThrow(/No `publish`/);
  });

  it("matches the real netlify.toml", () => {
    const realToml = readFileSync(
      resolve(__dirname, "../../netlify.toml"),
      "utf8",
    );
    expect(parsePublishDir(realToml)).toBe("dist");
  });
});

describe("findSourceMaps", () => {
  it("returns nested .map files and ignores other files", () => {
    writeProjectFile("out/_nuxt/app.js");
    writeProjectFile("out/_nuxt/app.js.map");
    writeProjectFile("out/deep/er/style.css.map");
    expect(findSourceMaps(join(projectDirectory, "out"))).toEqual([
      join("_nuxt", "app.js.map"),
      join("deep", "er", "style.css.map"),
    ]);
  });

  it("throws when the publish directory is missing", () => {
    expect(() => findSourceMaps(join(projectDirectory, "nope"))).toThrow(
      /does not exist/,
    );
  });
});

describe("runGuard", () => {
  it("passes on a clean build", () => {
    writeProjectFile("out/_nuxt/app.js");
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runGuard(join(projectDirectory, "netlify.toml"))).toBe(0);
  });

  it("fails and lists the offending files when a .map is left behind", () => {
    writeProjectFile("out/_nuxt/app.js");
    writeProjectFile("out/_nuxt/app.js.map");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(runGuard(join(projectDirectory, "netlify.toml"))).toBe(1);
    const output = errorSpy.mock.calls.flat().join("\n");
    expect(output).toContain(join("out", "_nuxt", "app.js.map"));
  });

  it("does not scan unpublished directories", () => {
    writeProjectFile("out/index.html");
    writeProjectFile(".netlify/functions-internal/server/chunk.js.map");
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runGuard(join(projectDirectory, "netlify.toml"))).toBe(0);
  });
});

describe("CLI entrypoint", () => {
  it("exits non-zero when a source map remains", () => {
    writeProjectFile("out/a.js.map");
    const result = spawnSync(process.execPath, [
      SCRIPT_PATH,
      join(projectDirectory, "netlify.toml"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain("a.js.map");
  });

  it("exits zero on a clean build", () => {
    writeProjectFile("out/a.js");
    const result = spawnSync(process.execPath, [
      SCRIPT_PATH,
      join(projectDirectory, "netlify.toml"),
    ]);
    expect(result.status).toBe(0);
  });

  it("exits non-zero when the publish directory is missing", () => {
    const result = spawnSync(process.execPath, [
      SCRIPT_PATH,
      join(projectDirectory, "netlify.toml"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toMatch(/does not exist/);
  });
});
