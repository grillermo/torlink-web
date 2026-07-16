// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import { LOGO_LINES } from "../logo";
import { SHEEN_TICK_MS } from "../sheen";
import { Logo } from "./Logo";
import { TabTitle } from "./TabTitle";
import { StoreContext, type Store } from "../store";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const state: AppState = {
  queue: [
    { id: "active", name: "active", magnet: "magnet:?active", dir: "/tmp", status: "downloading", progress: 1, totalBytes: 1, downloadedBytes: 0, speed: 1, peers: 1, addedAt: 1 },
    { id: "paused", name: "paused", magnet: "magnet:?paused", dir: "/tmp", status: "paused", progress: 1, totalBytes: 1, downloadedBytes: 0, speed: 0, peers: 0, addedAt: 1 },
  ],
  seeds: [], history: [],
  config: { downloadDir: "/tmp", downloadDirs: ["/tmp"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
};

const store: Store = {
  config: state.config, state, view: "browser", setView: () => {}, query: "", submitQuery: () => {},
  section: "all", setSection: () => {}, region: "content", setRegion: () => {},
  captureMode: "none", setCaptureMode: () => {}, downloadFocus: null, setDownloadFocus: () => {},
  seedFocus: null, setSeedFocus: () => {}, startDownload: () => {}, cancelDownload: () => {}, toggleDownload: () => {}, retryFailed: () => {}, removeHistory: () => {}, clearHistory: () => {}, copyMagnet: () => {},
  showError: () => {}, notice: null, setNotice: () => {}, quitAll: () => {},
};

function WithStore({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

describe("Logo", () => {
  it("renders the shared wordmark one character span at a time", () => {
    const view = render(<Logo />);
    expect(view.container.textContent).toBe(LOGO_LINES.join(""));
    expect(view.container.querySelectorAll(".logo-line span")).toHaveLength(
      LOGO_LINES.reduce((total, line) => total + [...line].length, 0),
    );
  });

  it("advances the per-character sheen on its shared timer", () => {
    vi.useFakeTimers();
    const view = render(<Logo />);
    const classesBefore = [...view.container.querySelectorAll(".logo-line span.b:not(.good)")]
      .map((span) => span.className);

    act(() => vi.advanceTimersByTime(SHEEN_TICK_MS * 10));

    const classesAfter = [...view.container.querySelectorAll(".logo-line span.b:not(.good)")]
      .map((span) => span.className);
    expect(classesAfter).not.toEqual(classesBefore);
  });
});

describe("TabTitle", () => {
  it("sets the active download title suffix", () => {
    render(<WithStore><TabTitle /></WithStore>);
    expect(document.title).toBe("↓1 · torlink");
  });
});
