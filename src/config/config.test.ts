import { describe, expect, it } from "vitest";
import { sanitizeKbps, normalizeDirList } from "./config";

describe("sanitizeKbps", () => {
  it("keeps a positive rate", () => {
    expect(sanitizeKbps(1500)).toBe(1500);
  });

  it("treats 0 as unlimited (kept as 0)", () => {
    expect(sanitizeKbps(0)).toBe(0);
  });

  it("floors fractional rates to whole KB/s", () => {
    expect(sanitizeKbps(1500.7)).toBe(1500);
  });

  it("clamps a negative rate to 0", () => {
    expect(sanitizeKbps(-5)).toBe(0);
  });

  it("falls back to 0 for non-numbers", () => {
    expect(sanitizeKbps("1500")).toBe(0);
    expect(sanitizeKbps(undefined)).toBe(0);
    expect(sanitizeKbps(null)).toBe(0);
  });

  it("falls back to 0 for NaN and Infinity", () => {
    expect(sanitizeKbps(Number.NaN)).toBe(0);
    expect(sanitizeKbps(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("normalizeDirList", () => {
  it("seeds the list from the active dir when dirs is missing", () => {
    expect(normalizeDirList("/a", undefined)).toEqual(["/a"]);
  });

  it("drops blank and non-string entries", () => {
    expect(normalizeDirList("/a", ["/a", "", "  ", 5, null, "/b"])).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("dedupes by normalized value", () => {
    expect(normalizeDirList("/a", ["/a", "/a/", "/b", "/b"])).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("prepends the active dir when absent", () => {
    expect(normalizeDirList("/a", ["/b", "/c"])).toEqual(["/a", "/b", "/c"]);
  });
});
