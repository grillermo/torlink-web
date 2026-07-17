// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { Splash } from "./Splash";
import { StoreContext, type Store } from "../store";

const state: AppState = {
  queue: [], seeds: [], history: [],
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
};

function renderSplash() {
  const store: Store = {
    config: state.config, state, view: "splash", setView: vi.fn(), query: "", submitQuery: vi.fn(),
    section: "all", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), cancelDownload: vi.fn(), toggleDownload: vi.fn(), retryFailed: vi.fn(), removeHistory: vi.fn(), clearHistory: vi.fn(), copyMagnet: vi.fn(),
    showError: vi.fn(), notice: null, setNotice: vi.fn(),
  };
  return { ...render(<StoreContext.Provider value={store}><Splash /></StoreContext.Provider>), store };
}

afterEach(cleanup);

describe("Splash", () => {
  it("renders its logo, copy, source categories, search, and footer hints", () => {
    const view = renderSplash();
    expect(view.getByLabelText("torlink")).toBeTruthy();
    expect(view.getByText("A curated, local web app for torrent downloads.")).toBeTruthy();
    expect(view.getByText(/games.*·.*movies.*·.*tv.*·.*anime/i)).toBeTruthy();
    expect(view.getByPlaceholderText("Search or paste a magnet link…")).toBeTruthy();
    expect(view.container.querySelector(".splash-footer")?.textContent).toMatch(/search.*empty.*browse/i);
  });

  it("submits both a query and empty browse input", () => {
    const { getByRole, store } = renderSplash();
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "ubuntu" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(store.submitQuery).toHaveBeenNthCalledWith(1, "ubuntu");
    expect(store.submitQuery).toHaveBeenNthCalledWith(2, "");
  });

  it("leaves typing keys in the search input native", () => {
    const { getByRole } = renderSplash();
    const event = createEvent.keyDown(getByRole("textbox"), { key: "c" });
    fireEvent(getByRole("textbox"), event);
    expect(event.defaultPrevented).toBe(false);
  });
});
