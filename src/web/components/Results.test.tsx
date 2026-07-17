// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import type { TorrentResult } from "../../sources/types";
import { StoreContext, type Store } from "../store";
import { Results } from "./Results";

const search = vi.hoisted(() => ({
  current: {
    results: [] as TorrentResult[],
    perSource: {} as Record<string, { loading: boolean; error: string | null; code: string | null; count: number }>,
    loading: false,
    done: 10,
    total: 10,
  },
}));

vi.mock("../hooks/useConcurrentSearch", () => ({ useConcurrentSearch: () => search.current }));

const state: AppState = {
  queue: [], seeds: [], history: [],
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
};

const results: TorrentResult[] = [
  { infoHash: "one", name: "Movie small", sizeBytes: 1_000, seeders: 2, leechers: 1, source: "yts", magnet: "magnet:?one", added: 1 },
  { infoHash: "two", name: "Movie large", sizeBytes: 2_000, seeders: 8, leechers: 3, source: "tpb-movies", magnet: "magnet:?two", added: 2 },
  { infoHash: "three", name: "Game", sizeBytes: 3_000, seeders: 4, leechers: 0, source: "fitgirl", magnet: "magnet:?three", added: 3 },
];

function renderResults(overrides: Partial<Store> = {}) {
  const store: Store = {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "ubuntu", submitQuery: vi.fn(),
    section: "all", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), cancelDownload: vi.fn(), toggleDownload: vi.fn(), retryFailed: vi.fn(), removeHistory: vi.fn(), clearHistory: vi.fn(), copyMagnet: vi.fn(),
    showError: vi.fn(), notice: null, setNotice: vi.fn(), quitAll: vi.fn(), ...overrides,
  };
  const view = render(<StoreContext.Provider value={store}><Results /></StoreContext.Provider>);
  /** Scoped to the rows — the category chips are buttons with the same names. */
  const rowsNamed = (name: RegExp): HTMLElement[] => {
    const list = view.container.querySelector(".result-list");
    return list ? within(list as HTMLElement).getAllByRole("button", { name }) : [];
  };
  return { ...view, rowsNamed, store };
}

afterEach(() => {
  cleanup();
  search.current = { results: [], perSource: {}, loading: false, done: 10, total: 10 };
});

describe("Results", () => {
  it("filters the current category and cycles Task 9 sorting with s", () => {
    search.current = { ...search.current, results };
    const view = renderResults({ section: "movies" });

    expect(view.getByText("Movie small")).toBeTruthy();
    expect(view.queryByText("Game")).toBeNull();
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyDown(window, { key: "s" });
    expect(view.rowsNamed(/Movie/).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Movie large"),
      expect.stringContaining("Movie small"),
    ]);
  });

  it("shows the per-source loading status and empty-state copy", () => {
    search.current = { ...search.current, loading: true, done: 3, total: 10 };
    const loading = renderResults();
    expect(loading.getByText(/Searching 3\/10 sources/)).toBeTruthy();
    loading.unmount();

    search.current = { ...search.current, loading: false };
    const empty = renderResults();
    expect(empty.getByText('No results for "ubuntu".')).toBeTruthy();
  });

  it("selects rows by click, enters on double click, and cleans up inactive keyboard handling", () => {
    search.current = { ...search.current, results };
    const view = renderResults();
    const rows = view.rowsNamed(/Movie|Game/);
    fireEvent.click(rows[1]!);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(window, { key: "d" });
    expect(view.store.startDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "two" }));
    fireEvent.doubleClick(rows[0]!);
    expect(view.getByText("Hash")).toBeTruthy();
    fireEvent.keyDown(window, { key: "y" });
    expect(view.store.copyMagnet).toHaveBeenCalledWith({ name: "Movie small", magnet: "magnet:?one" });
    view.unmount();
    fireEvent.keyDown(window, { key: "d" });
    expect(view.store.startDownload).toHaveBeenCalledTimes(1);
  });

  it("activates content when a result is clicked from the inactive region", () => {
    search.current = { ...search.current, results };
    const view = renderResults({ region: "sidebar" });
    const row = view.getByRole("button", { name: /Movie small/ });

    fireEvent.click(row);

    expect(view.store.setRegion).toHaveBeenCalledWith("content");
  });
});
