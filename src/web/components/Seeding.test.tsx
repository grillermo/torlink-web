// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { StoreContext, type Store } from "../store";
import { Seeding } from "./Seeding";

const state: AppState = {
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
  queue: [],
  seeds: [
    { id: "seeding", name: "Seeding", magnet: "magnet:?seeding", dir: "/downloads", sizeBytes: 1_000, status: "seeding", uploadSpeed: 512, uploaded: 2_000, peers: 3, source: "yts" },
    { id: "paused", name: "Paused", magnet: "magnet:?paused", dir: "/downloads", sizeBytes: 2_000, status: "paused", uploadSpeed: 0, uploaded: 1_000, peers: 0, source: "fitgirl" },
    { id: "missing", name: "Missing", magnet: "magnet:?missing", dir: "/downloads", sizeBytes: 3_000, status: "missing", uploadSpeed: 0, uploaded: 0, peers: 0 },
  ],
  history: [
    { id: "seeding", name: "Seeding", magnet: "magnet:?seeding", dir: "/downloads", sizeBytes: 1_000, completedAt: 1, source: "yts" },
    { id: "paused", name: "Paused", magnet: "magnet:?paused", dir: "/downloads", sizeBytes: 2_000, completedAt: 1, source: "fitgirl" },
    { id: "missing", name: "Missing", magnet: "magnet:?missing", dir: "/downloads", sizeBytes: 3_000, completedAt: 1 },
    { id: "idle", name: "Idle", magnet: "magnet:?idle", dir: "/downloads", sizeBytes: 4_000, completedAt: 1 },
  ],
};

function renderSeeding(overrides: Partial<Store> = {}) {
  const store = {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "", submitQuery: vi.fn(),
    section: "seeding", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), cancelDownload: vi.fn(), toggleDownload: vi.fn(), retryFailed: vi.fn(), removeHistory: vi.fn(), clearHistory: vi.fn(), copyMagnet: vi.fn(),
    toggleSeed: vi.fn(), showError: vi.fn(), notice: null, setNotice: vi.fn(), ...overrides,
  } as unknown as Store & { toggleSeed: ReturnType<typeof vi.fn> };
  return { ...render(<StoreContext.Provider value={store}><Seeding /></StoreContext.Provider>), store };
}

afterEach(cleanup);

describe("Seeding", () => {
  it("keeps seeding, paused, missing, and idle history rows in TUI order with active totals", () => {
    const view = renderSeeding();
    const text = view.container.textContent ?? "";

    expect(text).toMatch(/512 B\/s[\s\S]*3 peers[\s\S]*2\.93 KB shared back/);
    expect(text).toMatch(/Seeding[\s\S]*Paused[\s\S]*Missing[\s\S]*Idle/);
    expect(text).toMatch(/ready/);
  });

  it("selects rows by click, moves selection, and dispatches pause, resume, missing notice, and removal", () => {
    const view = renderSeeding();
    const pausedRow = view.getByRole("button", { name: /Paused/ });

    fireEvent.click(pausedRow);
    expect(pausedRow.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(window, { key: "p" });
    expect(view.store.toggleSeed).toHaveBeenCalledWith("paused", "resume");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "p" });
    expect(view.store.toggleSeed).toHaveBeenCalledWith("missing", "resume");
    expect(view.store.setNotice).toHaveBeenCalledWith("⚠ That file isn't on disk anymore.");

    fireEvent.keyDown(window, { key: "c" });
    expect(view.store.removeHistory).toHaveBeenCalledWith("missing");
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("leaves modified c shortcuts to the browser", (init) => {
    const view = renderSeeding();
    fireEvent.keyDown(window, { key: "c", ...init });
    expect(view.store.removeHistory).not.toHaveBeenCalled();
  });

  it("gates keyboard handling outside content and clears seed focus on unmount", () => {
    const view = renderSeeding({ region: "sidebar" });
    fireEvent.keyDown(window, { key: "p" });
    expect(view.store.toggleSeed).not.toHaveBeenCalled();
    view.unmount();
    expect(view.store.setSeedFocus).toHaveBeenLastCalledWith(null);
  });
});
