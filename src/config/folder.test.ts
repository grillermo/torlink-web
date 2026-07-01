import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { expandHome, normalizeDownloadDir } from "./folder";

// folder.ts imports the host-native "node:path", which on this repo's POSIX
// dev/CI machines always resolves to path.posix. To actually exercise the
// Windows branch of normalizeDownloadDir (backslash separators, "C:\" drive
// roots) we swap in path.win32 for the duration of a single dynamic import,
// so the production code genuinely runs Windows path semantics regardless of
// the host OS.
async function importWithWin32Path() {
  vi.resetModules();
  vi.doMock("node:path", async () => {
    const actual = await vi.importActual<typeof import("node:path")>("node:path");
    return { ...actual.win32, default: actual.win32 };
  });
  const mod = await import("./folder");
  vi.doUnmock("node:path");
  return mod;
}

const HOME = path.join(path.sep, "home", "ada");

describe("expandHome", () => {
  it("maps a bare tilde to the home directory", () => {
    expect(expandHome("~", HOME)).toBe(HOME);
  });

  it("expands a leading ~/ segment", () => {
    expect(expandHome("~/Movies", HOME)).toBe(path.join(HOME, "Movies"));
  });

  it("expands a leading ~\\ segment for paths typed on Windows", () => {
    expect(expandHome("~\\Movies", HOME)).toBe(path.join(HOME, "Movies"));
  });

  it("leaves an absolute path untouched apart from trimming", () => {
    const abs = path.join(path.sep, "mnt", "media");
    expect(expandHome(`  ${abs}  `, HOME)).toBe(abs);
  });

  it("does not expand a tilde that is not a path prefix", () => {
    expect(expandHome("~weird", HOME)).toBe("~weird");
  });
});

describe("normalizeDownloadDir", () => {
  it("returns an empty string for blank input", () => {
    expect(normalizeDownloadDir("   ", HOME)).toBe("");
  });

  it("normalizes a tilde path into a usable directory", () => {
    expect(normalizeDownloadDir("~/Downloads/torlink", HOME)).toBe(
      path.normalize(path.join(HOME, "Downloads", "torlink")),
    );
  });

  it("strips trailing separators from paths for consistent deduplication", () => {
    const pathNoTrailing = path.join(HOME, "Downloads", "torlink");
    const pathWithTrailing = pathNoTrailing + path.sep;

    const result1 = normalizeDownloadDir(pathNoTrailing, HOME);
    const result2 = normalizeDownloadDir(pathWithTrailing, HOME);

    expect(result1).toBe(result2);
  });

  it("preserves the root directory without stripping the separator", () => {
    // Root paths (e.g., "/" on POSIX, "C:\" on Windows) should not be modified.
    // Verify by checking that the parsed root equals the result.
    const root = path.sep === "/" ? "/" : "C:\\";
    const result = normalizeDownloadDir(root, HOME);
    const parsed = path.parse(result);
    expect(parsed.root).toBe(result);
  });
});

// The tests above run against the host's native path module, which is always
// path.posix on this repo's dev/CI machines - so they never actually exercise
// the Windows branch (backslash separators, "C:\" drive roots). These tests
// force node:path to resolve to path.win32 for the duration of the import, so
// the code under test genuinely runs Windows path semantics.
describe("normalizeDownloadDir on Windows-style paths", () => {
  it("dedupes a trailing backslash the same as no trailing backslash", async () => {
    const { normalizeDownloadDir: normalizeWin32 } = await importWithWin32Path();

    const withoutTrailing = normalizeWin32("C:\\Users\\ada\\Downloads", "C:\\Users\\ada");
    const withTrailing = normalizeWin32("C:\\Users\\ada\\Downloads\\", "C:\\Users\\ada");

    expect(withTrailing).toBe(withoutTrailing);
  });

  it("preserves a Windows drive root", async () => {
    const { normalizeDownloadDir: normalizeWin32 } = await importWithWin32Path();

    expect(normalizeWin32("C:\\", "C:\\Users\\ada")).toBe("C:\\");
  });
});
