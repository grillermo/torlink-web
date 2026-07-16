// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { SearchBar } from "./SearchBar";
import { StoreContext, type Store } from "../store";

const state: AppState = {
  queue: [], seeds: [], history: [],
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
};

function renderSearchBar(props: Partial<ComponentProps<typeof SearchBar>> = {}) {
  const store: Store = {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "", submitQuery: vi.fn(),
    section: "all", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), copyMagnet: vi.fn(),
    showError: vi.fn(), notice: null, setNotice: vi.fn(), quitAll: vi.fn(),
  };
  const defaults = { width: 40, value: "initial", editing: true, onSubmit: vi.fn() };
  return {
    ...render(<StoreContext.Provider value={store}><SearchBar {...defaults} {...props} /></StoreContext.Provider>),
    store,
  };
}

afterEach(cleanup);

describe("SearchBar", () => {
  it("controls and synchronizes its native input while capturing text", () => {
    const onChange = vi.fn();
    const view = renderSearchBar({ onChange });
    const input = view.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("initial");
    expect(view.store.setCaptureMode).toHaveBeenCalledWith("text");
    fireEvent.change(input, { target: { value: "ubuntu" } });
    expect(onChange).toHaveBeenCalledWith("ubuntu");
    view.rerender(<StoreContext.Provider value={view.store}><SearchBar width={40} value="fedora" editing onSubmit={vi.fn()} onChange={onChange} /></StoreContext.Provider>);
    expect(input.value).toBe("fedora");
  });

  it("submits on Enter and leaves editing on Escape", () => {
    const onSubmit = vi.fn();
    const onExitDown = vi.fn();
    const view = renderSearchBar({ onSubmit, onExitDown });
    const input = view.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ubuntu" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ubuntu");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onExitDown).toHaveBeenCalledOnce();
    expect(view.store.setCaptureMode).toHaveBeenLastCalledWith("none");
  });

  it("exits downward and left only at the caret boundary, then cleans up capture mode", () => {
    const onExitDown = vi.fn();
    const onExitLeft = vi.fn();
    const view = renderSearchBar({ value: "ubuntu", onExitDown, onExitLeft });
    const input = view.getByRole("textbox") as HTMLInputElement;
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(onExitLeft).not.toHaveBeenCalled();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onExitLeft).toHaveBeenCalledOnce();
    expect(onExitDown).toHaveBeenCalledOnce();
    view.unmount();
    expect(view.store.setCaptureMode).toHaveBeenLastCalledWith("none");
  });
});
