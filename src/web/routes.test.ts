import { describe, expect, it } from "vitest";
import { overlayPath, overlayToPrompt, parseRoute, promptToOverlay, sectionPath } from "./routes";

describe("parseRoute", () => {
  it("maps / to the splash", () => {
    expect(parseRoute("/", "")).toEqual({
      view: "splash", section: "all", overlay: null, query: "", redirect: false,
    });
  });

  it("maps a section path with a query", () => {
    expect(parseRoute("/movies", "?q=dune")).toEqual({
      view: "browser", section: "movies", overlay: null, query: "dune", redirect: false,
    });
  });

  it("maps a section path with an overlay", () => {
    expect(parseRoute("/downloads/settings", "")).toEqual({
      view: "browser", section: "downloads", overlay: "settings", query: "", redirect: false,
    });
  });

  it("flags unknown sections for redirect", () => {
    expect(parseRoute("/nope", "").redirect).toBe(true);
  });

  it("flags unknown overlays and extra segments for redirect", () => {
    expect(parseRoute("/all/nope", "").redirect).toBe(true);
    expect(parseRoute("/all/settings/extra", "").redirect).toBe(true);
  });
});

describe("path builders", () => {
  it("builds section and overlay paths, encoding the query", () => {
    expect(sectionPath("all", "")).toBe("/all");
    expect(sectionPath("movies", "dune 2")).toBe("/movies?q=dune%202");
    expect(overlayPath("downloads", "settings", "")).toBe("/downloads/settings");
    expect(overlayPath("all", "throttle-download", "x")).toBe("/all/throttle-download?q=x");
  });
});

describe("prompt mapping", () => {
  it("round-trips prompts through overlay slugs", () => {
    expect(promptToOverlay("download")).toBe("throttle-download");
    expect(promptToOverlay("upload")).toBe("throttle-upload");
    expect(promptToOverlay("folder")).toBe("folder");
    expect(promptToOverlay("trackers")).toBe("trackers");
    expect(overlayToPrompt("throttle-download")).toBe("download");
    expect(overlayToPrompt("throttle-upload")).toBe("upload");
    expect(overlayToPrompt("folder")).toBe("folder");
    expect(overlayToPrompt("settings")).toBeNull();
    expect(overlayToPrompt("help")).toBeNull();
    expect(overlayToPrompt(null)).toBeNull();
  });
});
