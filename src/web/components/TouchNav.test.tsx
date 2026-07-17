// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { FilterChips } from "./FilterChips";
import { SettingsSheet } from "./SettingsSheet";
import { TabBar } from "./TabBar";
import { StoreContext, type Store } from "../store";

const state: AppState = {
  queue: [],
  seeds: [],
  history: [],
  config: {
    downloadDir: "/downloads",
    downloadDirs: ["/downloads"],
    trackers: ["udp://tracker.example:80"],
    maxDownloadKbps: 0,
    maxUploadKbps: 100,
  },
};

function storeFor(overrides: Partial<Store> = {}): Store {
  return {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "", submitQuery: vi.fn(),
    section: "all", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), cancelDownload: vi.fn(),
    toggleDownload: vi.fn(), retryFailed: vi.fn(), removeHistory: vi.fn(), clearHistory: vi.fn(),
    copyMagnet: vi.fn(), showError: vi.fn(), notice: null, setNotice: vi.fn(), quitAll: vi.fn(),
    ...overrides,
  };
}

function renderTabBar(overrides: Partial<Store> = {}, props: { settingsOpen?: boolean } = {}) {
  const store = storeFor(overrides);
  const onOpenSettings = vi.fn();
  const view = render(
    <StoreContext.Provider value={store}>
      <TabBar onOpenSettings={onOpenSettings} settingsOpen={props.settingsOpen ?? false} />
    </StoreContext.Provider>,
  );
  return { ...view, onOpenSettings, store };
}

afterEach(cleanup);

describe("TabBar", () => {
  it("keeps Browse current for any category, since the chips live inside it", () => {
    const view = renderTabBar({ section: "anime" });
    expect(view.getByRole("button", { name: /Browse/ }).getAttribute("aria-current")).toBe("page");
    expect(view.getByRole("button", { name: /Downloads/ }).getAttribute("aria-current")).toBeNull();
  });

  it("marks the library section it is showing", () => {
    const view = renderTabBar({ section: "seeding" });
    expect(view.getByRole("button", { name: /Seeding/ }).getAttribute("aria-current")).toBe("page");
  });

  it("opens a tapped section in the content region", () => {
    const { getByRole, store } = renderTabBar();
    fireEvent.click(getByRole("button", { name: /Downloads/ }));
    expect(store.setSection).toHaveBeenCalledWith("downloads");
    expect(store.setRegion).toHaveBeenCalledWith("content");
  });

  it("routes Settings to the sheet rather than to a section", () => {
    const { getByRole, onOpenSettings, store } = renderTabBar();
    fireEvent.click(getByRole("button", { name: /Settings/ }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(store.setSection).not.toHaveBeenCalled();
  });

  it("marks Settings current while its sheet is open", () => {
    const view = renderTabBar({ section: "downloads" }, { settingsOpen: true });
    expect(view.getByRole("button", { name: /Settings/ }).getAttribute("aria-current")).toBe("page");
    expect(view.getByRole("button", { name: /Downloads/ }).getAttribute("aria-current")).toBeNull();
  });
});

describe("FilterChips", () => {
  it("presses the chip for the active category", () => {
    const store = storeFor({ section: "movies" });
    const view = render(<StoreContext.Provider value={store}><FilterChips /></StoreContext.Provider>);
    expect(view.getByRole("button", { name: "Movies" }).getAttribute("aria-pressed")).toBe("true");
    expect(view.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("selects a tapped category in the content region", () => {
    const store = storeFor();
    const view = render(<StoreContext.Provider value={store}><FilterChips /></StoreContext.Provider>);
    fireEvent.click(view.getByRole("button", { name: "Games" }));
    expect(store.setSection).toHaveBeenCalledWith("games");
    expect(store.setRegion).toHaveBeenCalledWith("content");
  });
});

describe("SettingsSheet", () => {
  function renderSheet() {
    const store = storeFor();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    const view = render(
      <StoreContext.Provider value={store}>
        <SettingsSheet onCancel={onCancel} onSelect={onSelect} />
      </StoreContext.Provider>,
    );
    return { ...view, onCancel, onSelect, store };
  }

  it("summarises the current config, with throttles read as rates", () => {
    const view = renderSheet();
    expect(view.getByText("/downloads")).toBeTruthy();
    expect(view.getByText("1 configured")).toBeTruthy();
    expect(view.getByText("unlimited")).toBeTruthy();
    expect(view.getByText("100 KB/s")).toBeTruthy();
  });

  it("hands each entry to the prompt its keybinding opens", () => {
    const { getByRole, onSelect } = renderSheet();
    fireEvent.click(getByRole("button", { name: /Upload limit/ }));
    expect(onSelect).toHaveBeenCalledWith("upload");
  });

  it("closes without touching the config", () => {
    const { getByRole, onCancel, store } = renderSheet();
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalled();
    expect(store.quitAll).not.toHaveBeenCalled();
  });
});
