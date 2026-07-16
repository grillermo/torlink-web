// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { handleGlobalKey, type KeyDeps } from "./keyboard";

function deps(over: Partial<KeyDeps> = {}): KeyDeps {
  return {
    region: "content",
    setRegion: vi.fn(),
    setView: vi.fn(),
    captureMode: "none",
    editingPrompt: false,
    errorItem: null,
    clearErrorItem: vi.fn(),
    showHelp: false,
    setShowHelp: vi.fn(),
    openFolder: vi.fn(),
    openTrackers: vi.fn(),
    openThrottle: vi.fn(),
    pasteMagnet: vi.fn(),
    quitAll: vi.fn(),
    ...over,
  };
}

function key(k: string, target?: Partial<EventTarget & { tagName: string }>): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, cancelable: true });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("handleGlobalKey", () => {
  it("? opens help; any key closes it", () => {
    const d = deps();
    handleGlobalKey(key("?"), d);
    expect(d.setShowHelp).toHaveBeenCalledWith(true);
    const open = deps({ showHelp: true });
    handleGlobalKey(key("x"), open);
    expect(open.setShowHelp).toHaveBeenCalledWith(false);
  });

  it("tab toggles region and q quits", () => {
    const d = deps({ region: "sidebar" });
    handleGlobalKey(key("Tab"), d);
    expect(d.setRegion).toHaveBeenCalledWith("content");
    handleGlobalKey(key("q"), d);
    expect(d.quitAll).toHaveBeenCalled();
  });

  it("escape walks content -> sidebar -> splash", () => {
    const d = deps({ region: "content" });
    handleGlobalKey(key("Escape"), d);
    expect(d.setRegion).toHaveBeenCalledWith("sidebar");
    const side = deps({ region: "sidebar" });
    handleGlobalKey(key("Escape"), side);
    expect(side.setView).toHaveBeenCalledWith("splash");
  });

  it("ignores keys typed into an input", () => {
    const d = deps();
    handleGlobalKey(key("q", { tagName: "INPUT" }), d);
    expect(d.quitAll).not.toHaveBeenCalled();
  });

  it("prompt-open keys and paste dispatch", () => {
    const d = deps();
    handleGlobalKey(key("o"), d);
    expect(d.openFolder).toHaveBeenCalled();
    handleGlobalKey(key("t"), d);
    expect(d.openTrackers).toHaveBeenCalled();
    handleGlobalKey(key("r"), d);
    expect(d.openThrottle).toHaveBeenCalledWith("download");
    handleGlobalKey(key("u"), d);
    expect(d.openThrottle).toHaveBeenCalledWith("upload");
    handleGlobalKey(key("m"), d);
    expect(d.pasteMagnet).toHaveBeenCalled();
  });
});
