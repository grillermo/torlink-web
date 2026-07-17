// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { handleGlobalKey, isPlainShortcut, type KeyDeps } from "./keyboard";

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
   
    ...over,
  };
}

function key(
  k: string,
  target?: Partial<EventTarget & { tagName: string }>,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, cancelable: true, ...init });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("handleGlobalKey", () => {
  it.each([
    [{}, true],
    [{ ctrlKey: true }, false],
    [{ metaKey: true }, false],
    [{ altKey: true }, false],
  ] as const)("recognizes %# as a plain shortcut", (init, expected) => {
    expect(isPlainShortcut(key("r", undefined, init))).toBe(expected);
  });

  it("? opens help; any key closes it", () => {
    const d = deps();
    handleGlobalKey(key("?"), d);
    expect(d.setShowHelp).toHaveBeenCalledWith(true);
    const open = deps({ showHelp: true });
    handleGlobalKey(key("x"), open);
    expect(open.setShowHelp).toHaveBeenCalledWith(false);
  });

  it("tab toggles region", () => {
    const d = deps({ region: "sidebar" });
    handleGlobalKey(key("Tab"), d);
    expect(d.setRegion).toHaveBeenCalledWith("content");
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
    handleGlobalKey(key("o", { tagName: "INPUT" }), d);
    expect(d.openFolder).not.toHaveBeenCalled();
  });

  it("ignores textarea and composing input", () => {
    const textarea = deps();
    handleGlobalKey(key("o", { tagName: "TEXTAREA" }), textarea);
    expect(textarea.openFolder).not.toHaveBeenCalled();

    const composing = deps();
    const event = key("o");
    Object.defineProperty(event, "isComposing", { value: true });
    handleGlobalKey(event, composing);
    expect(composing.openFolder).not.toHaveBeenCalled();
  });

  it("lets an open prompt own all input", () => {
    const d = deps({ editingPrompt: true, errorItem: {}, showHelp: true });
    const event = key("o");
    handleGlobalKey(event, d);
    expect(d.clearErrorItem).not.toHaveBeenCalled();
    expect(d.setShowHelp).not.toHaveBeenCalled();
    expect(d.openFolder).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("dismisses an error before help", () => {
    const d = deps({ errorItem: {}, showHelp: true });
    handleGlobalKey(key("x"), d);
    expect(d.clearErrorItem).toHaveBeenCalledOnce();
    expect(d.setShowHelp).not.toHaveBeenCalled();
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("leaves modified r shortcuts to the browser", (init) => {
    const d = deps();
    const event = key("r", undefined, init);
    handleGlobalKey(event, d);
    expect(d.openThrottle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("prevents browser defaults only for handled keys", () => {
    const d = deps();
    const tab = key("Tab");
    handleGlobalKey(tab, d);
    expect(tab.defaultPrevented).toBe(true);

    const unknown = key("z");
    handleGlobalKey(unknown, d);
    expect(unknown.defaultPrevented).toBe(false);
  });

  it.each([
    ["ArrowRight", "sidebar", "content"],
    ["l", "sidebar", "content"],
    ["ArrowLeft", "content", "sidebar"],
    ["h", "content", "sidebar"],
  ] as const)("%s moves %s to %s", (pressed, from, to) => {
    const d = deps({ region: from });
    handleGlobalKey(key(pressed), d);
    expect(d.setRegion).toHaveBeenCalledWith(to);
  });

  it("captureMode esc owns Escape while preventing its browser default", () => {
    const d = deps({ captureMode: "esc" });
    const event = key("Escape");
    handleGlobalKey(event, d);
    expect(event.defaultPrevented).toBe(true);
    expect(d.setRegion).not.toHaveBeenCalled();
    expect(d.setView).not.toHaveBeenCalled();
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
