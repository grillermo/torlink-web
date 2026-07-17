// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { StoreContext, type Store } from "../store";
import { Downloads } from "./Downloads";

const state: AppState = {
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
  queue: [
    { id: "down", name: "Downloading", magnet: "magnet:?down", dir: "/downloads", status: "downloading", progress: 50, totalBytes: 1_000, downloadedBytes: 500, speed: 100, peers: 2, addedAt: 1 },
    { id: "paused", name: "Paused", magnet: "magnet:?paused", dir: "/downloads", status: "paused", progress: 20, totalBytes: 1_000, downloadedBytes: 200, speed: 0, peers: 0, addedAt: 1 },
    { id: "failed", name: "Failed", magnet: "magnet:?failed", dir: "/downloads", status: "failed", progress: 0, totalBytes: 0, downloadedBytes: 0, speed: 0, peers: 0, error: "disk full", addedAt: 1 },
  ],
  seeds: [],
  history: [{ id: "recent", name: "Recent", magnet: "magnet:?recent", dir: "/downloads", sizeBytes: 2_000, completedAt: Date.now() }],
};

function renderDownloads(overrides: Partial<Store> = {}) {
  const store: Store = {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "", submitQuery: vi.fn(),
    section: "downloads", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), cancelDownload: vi.fn(), toggleDownload: vi.fn(), retryFailed: vi.fn(), removeHistory: vi.fn(), clearHistory: vi.fn(), copyMagnet: vi.fn(),
    showError: vi.fn(), notice: null, setNotice: vi.fn(), quitAll: vi.fn(), ...overrides,
  };
  return { ...render(<StoreContext.Provider value={store}><Downloads /></StoreContext.Provider>), store };
}

afterEach(cleanup);

describe("Downloads", () => {
  it("keeps downloading, paused, failed, and recent rows in TUI order", () => {
    const view = renderDownloads();
    const text = view.container.textContent ?? "";

    expect(text).toMatch(/Downloading[\s\S]*Paused[\s\S]*Failed[\s\S]*Recently downloaded[\s\S]*Recent/);
  });

  it("selects rows with click, enters failed details, and dispatches the download actions", () => {
    const view = renderDownloads();
    const pausedRow = view.getByRole("button", { name: /Paused/ });

    fireEvent.click(pausedRow);
    expect(pausedRow.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(window, { key: "p" });
    expect(view.store.toggleDownload).toHaveBeenCalledWith("paused", "resume");
    fireEvent.keyDown(window, { key: "c" });
    expect(view.store.cancelDownload).toHaveBeenCalledWith("paused");

    fireEvent.click(view.getByRole("button", { name: /Failed/ }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(view.store.showError).toHaveBeenCalledWith(expect.objectContaining({ id: "failed" }));
    fireEvent.keyDown(window, { key: "f" });
    expect(view.store.retryFailed).toHaveBeenCalledOnce();

    fireEvent.click(view.getByRole("button", { name: /Recent/ }));
    fireEvent.keyDown(window, { key: "d" });
    expect(view.store.startDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "recent" }));
    fireEvent.keyDown(window, { key: "c" });
    expect(view.store.removeHistory).toHaveBeenCalledWith("recent");
    fireEvent.keyDown(window, { key: "x" });
    expect(view.store.clearHistory).toHaveBeenCalledOnce();
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("leaves modified c shortcuts to the browser", (init) => {
    const view = renderDownloads();

    fireEvent.keyDown(window, { key: "c", ...init });
    expect(view.store.cancelDownload).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: /Recent/ }));
    fireEvent.keyDown(window, { key: "c", ...init });
    expect(view.store.removeHistory).not.toHaveBeenCalled();
  });

  it("double-clicks a failed row using that row's item", () => {
    const view = renderDownloads();
    fireEvent.click(view.getByRole("button", { name: /Recent/ }));

    fireEvent.doubleClick(view.getByRole("button", { name: /Failed/ }));

    expect(view.store.showError).toHaveBeenCalledWith(expect.objectContaining({ id: "failed" }));
    expect(view.store.startDownload).not.toHaveBeenCalled();
  });

  it("double-clicks a recent row using that row's item", () => {
    const view = renderDownloads();
    fireEvent.click(view.getByRole("button", { name: /Failed/ }));

    fireEvent.doubleClick(view.getByRole("button", { name: /Recent/ }));

    expect(view.store.startDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "recent" }));
    expect(view.store.showError).not.toHaveBeenCalled();
  });

  it("gates keyboard handling outside content and clears download focus on unmount", () => {
    const view = renderDownloads({ region: "sidebar" });
    fireEvent.keyDown(window, { key: "p" });
    expect(view.store.toggleDownload).not.toHaveBeenCalled();
    view.unmount();
    expect(view.store.setDownloadFocus).toHaveBeenLastCalledWith(null);
  });
});
