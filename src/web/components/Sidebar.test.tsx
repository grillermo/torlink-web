// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { Sidebar } from "./Sidebar";
import { StoreContext, type Store } from "../store";

const state: AppState = {
  queue: [
    { id: "one", name: "one", magnet: "magnet:?one", dir: "/downloads", status: "downloading", progress: 0, totalBytes: 0, downloadedBytes: 0, speed: 0, peers: 0, addedAt: 0 },
    { id: "two", name: "two", magnet: "magnet:?two", dir: "/downloads", status: "paused", progress: 0, totalBytes: 0, downloadedBytes: 0, speed: 0, peers: 0, addedAt: 0 },
  ],
  seeds: [
    { id: "seed", name: "seed", magnet: "magnet:?seed", dir: "/downloads", sizeBytes: 0, status: "seeding", uploaded: 0, uploadSpeed: 0, peers: 0 },
  ],
  history: [],
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
};

function renderSidebar(overrides: Partial<Store> = {}) {
  const store: Store = {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "", submitQuery: vi.fn(),
    section: "all", setSection: vi.fn(), region: "sidebar", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), copyMagnet: vi.fn(),
    showError: vi.fn(), notice: null, setNotice: vi.fn(), quitAll: vi.fn(), ...overrides,
  };
  return { ...render(<StoreContext.Provider value={store}><Sidebar /></StoreContext.Provider>), store };
}

afterEach(cleanup);

describe("Sidebar", () => {
  it("shows only active download and seeding counts", () => {
    const view = renderSidebar();
    expect(view.getByRole("button", { name: /Downloads/ }).textContent).toContain("(1)");
    expect(view.getByRole("button", { name: /Seeding/ }).textContent).toContain("(1)");
    expect(view.getByRole("button", { name: "All" }).getAttribute("aria-current")).toBe("page");
  });

  it("wraps sidebar keyboard movement from the first entry", () => {
    const { store } = renderSidebar();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(store.setSection).toHaveBeenCalledWith("seeding");
  });

  it("opens a clicked section in the content region", () => {
    const { store, getByRole } = renderSidebar();
    fireEvent.click(getByRole("button", { name: /Movies/ }));
    expect(store.setSection).toHaveBeenCalledWith("movies");
    expect(store.setRegion).toHaveBeenCalledWith("content");
  });
});
