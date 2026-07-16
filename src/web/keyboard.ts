import type { CaptureMode, Region, View } from "./store";

export interface KeyDeps {
  region: Region;
  setRegion(region: Region): void;
  setView(view: View): void;
  captureMode: CaptureMode;
  editingPrompt: boolean;
  errorItem: unknown | null;
  clearErrorItem(): void;
  showHelp: boolean;
  setShowHelp(show: boolean): void;
  openFolder(): void;
  openTrackers(): void;
  openThrottle(direction: "download" | "upload"): void;
  pasteMagnet(): void;
  quitAll(): void;
}

export function isPlainShortcut(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function handleGlobalKey(e: KeyboardEvent, deps: KeyDeps): void {
  const tagName = (e.target as { tagName?: string } | null)?.tagName?.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || e.isComposing) return;
  if (!isPlainShortcut(e)) return;
  if (deps.editingPrompt) return;

  if (deps.errorItem) {
    e.preventDefault();
    deps.clearErrorItem();
    return;
  }
  if (deps.showHelp) {
    e.preventDefault();
    deps.setShowHelp(false);
    return;
  }
  if (e.key === "?") {
    e.preventDefault();
    deps.setShowHelp(true);
    return;
  }
  if (e.key === "o") {
    e.preventDefault();
    deps.openFolder();
    return;
  }
  if (e.key === "t") {
    e.preventDefault();
    deps.openTrackers();
    return;
  }
  if (e.key === "r") {
    e.preventDefault();
    deps.openThrottle("download");
    return;
  }
  if (e.key === "u") {
    e.preventDefault();
    deps.openThrottle("upload");
    return;
  }
  if (e.key === "m") {
    e.preventDefault();
    deps.pasteMagnet();
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    deps.setRegion(deps.region === "sidebar" ? "content" : "sidebar");
    return;
  }
  if (e.key === "ArrowRight" || e.key === "l") {
    e.preventDefault();
    if (deps.region === "sidebar") deps.setRegion("content");
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "h") {
    e.preventDefault();
    if (deps.region === "content") deps.setRegion("sidebar");
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    if (deps.captureMode === "esc") return;
    if (deps.region === "content") deps.setRegion("sidebar");
    else deps.setView("splash");
    return;
  }
  if (e.key === "q") {
    e.preventDefault();
    deps.quitAll();
  }
}
