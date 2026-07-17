// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import type { QueueItem } from "../download/types";
import type { AppState } from "../server/state";
import { App } from "./App";
import type { ActionResponse } from "./api";
import { type Store, useStore } from "./store";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  server: {
    current: {
      state: null,
      completed: null,
      completedVersion: 0,
    } as { state: AppState | null; completed: string | null; completedVersion: number },
  },
}));

vi.mock("./api", () => ({ post: mocks.post }));
vi.mock("./hooks/useServerState", () => ({ useServerState: () => mocks.server.current }));

const baseState: AppState = {
  queue: [],
  seeds: [],
  history: [],
  config: {
    downloadDir: "/downloads",
    downloadDirs: ["/downloads"],
    trackers: [],
    maxDownloadKbps: 0,
    maxUploadKbps: 0,
  },
};

const failedItem: QueueItem = {
  id: "failed-id",
  name: "failed.iso",
  magnet: "magnet:?xt=urn:btih:failed-id",
  dir: "/downloads",
  status: "failed",
  progress: 0,
  totalBytes: 0,
  downloadedBytes: 0,
  speed: 0,
  peers: 0,
  error: "disk full",
  addedAt: 1,
};

let currentStore: Store | null = null;

function StoreProbe(): ReactNode {
  const store = useStore();
  const location = useLocation();
  currentStore = store;
  return (
    <div data-location={`${location.pathname}${location.search}`} data-testid="store-state">
      {store.state.queue.map((item) => item.name).join(",")}
    </div>
  );
}

function currentPath(view: ReturnType<typeof renderApp>): string | null {
  return view.getByTestId("store-state").getAttribute("data-location");
}

function appTree(): ReactNode {
  return <App><StoreProbe /></App>;
}

function renderApp(initialPath = "/") {
  return render(<MemoryRouter initialEntries={[initialPath]}>{appTree()}</MemoryRouter>);
}

function rerenderApp(view: ReturnType<typeof renderApp>): void {
  view.rerender(<MemoryRouter>{appTree()}</MemoryRouter>);
}

function hydrate(state: AppState = baseState, initialPath = "/") {
  mocks.server.current = { state, completed: null, completedVersion: 0 };
  return renderApp(initialPath);
}

function openBrowser(): void {
  act(() => currentStore!.submitQuery("ubuntu"));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  currentStore = null;
  mocks.post.mockReset();
  mocks.post.mockResolvedValue({ ok: true });
  mocks.server.current = { state: null, completed: null, completedVersion: 0 };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App state shell", () => {
  it("renders loading, then hydrates the state-backed splash shell", () => {
    const view = renderApp();
    expect(view.getByText("Starting torlink…")).toBeTruthy();

    mocks.server.current = { state: baseState, completed: null, completedVersion: 0 };
    rerenderApp(view);

    expect(view.container.querySelector('[data-view="splash"]')).toBeTruthy();
    expect(currentStore?.state).toBe(baseState);
  });

  it("refreshes context consumers when SSE state changes", () => {
    const view = hydrate();
    const next = { ...baseState, queue: [failedItem] };
    mocks.server.current = { state: next, completed: null, completedVersion: 0 };
    rerenderApp(view);

    expect(view.getByTestId("store-state").textContent).toBe("failed.iso");
    expect(currentStore?.state).toBe(next);
  });

  it("renders the primitive browser shell with contextual footer controls", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = hydrate();
    openBrowser();

    expect(view.getByLabelText("torlink")).toBeTruthy();
    expect(view.getByRole("button", { name: "? Keys" })).toBeTruthy();
    expect(document.title).toBe("torlink");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("wires the hydrated splash and browser sidebar ports into their existing slots", () => {
    const view = hydrate();
    expect(view.getByPlaceholderText("Search or paste a magnet link…")).toBeTruthy();
    openBrowser();
    expect(view.container.querySelector(".sidebar-slot button")).toBeTruthy();
    expect(view.getByRole("button", { name: "All" })).toBeTruthy();
  });
});

describe("App notices", () => {
  it("replaces notices and expires each replacement four seconds after it appears", () => {
    vi.useFakeTimers();
    const view = hydrate();
    openBrowser();

    act(() => currentStore!.setNotice("first"));
    expect(view.getByRole("status").textContent).toBe("first");
    act(() => vi.advanceTimersByTime(2000));
    act(() => currentStore!.setNotice("second"));
    act(() => vi.advanceTimersByTime(2000));
    expect(view.getByRole("status").textContent).toBe("second");
    act(() => vi.advanceTimersByTime(2000));
    expect(view.queryByRole("status")).toBeNull();
  });

  it("shows repeated same-name completion events", () => {
    vi.useFakeTimers();
    const view = hydrate();
    openBrowser();

    mocks.server.current = { state: baseState, completed: "same.iso", completedVersion: 1 };
    rerenderApp(view);
    expect(view.getByRole("status").textContent).toBe("✓ same.iso");
    act(() => vi.advanceTimersByTime(4000));
    expect(view.queryByRole("status")).toBeNull();

    mocks.server.current = { state: baseState, completed: "same.iso", completedVersion: 2 };
    rerenderApp(view);
    expect(view.getByRole("status").textContent).toBe("✓ same.iso");
  });

  it("does not let an older API completion replace a newer Store notice", async () => {
    const pending = deferred<ActionResponse>();
    mocks.post.mockReturnValueOnce(pending.promise);
    const view = hydrate();
    openBrowser();

    act(() => currentStore!.startDownload({
      id: "one", name: "one.iso", magnet: "magnet:?xt=urn:btih:one",
    }));
    act(() => currentStore!.setNotice("newer"));
    await act(async () => pending.resolve({ ok: true, notice: "older" }));

    expect(view.getByRole("status").textContent).toBe("newer");
  });

  it("does not let an older clipboard completion replace a newer SSE completion", async () => {
    const pending = deferred<void>();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => pending.promise) },
    });
    const view = hydrate();
    openBrowser();

    act(() => currentStore!.copyMagnet({ name: "one", magnet: "magnet:?xt=urn:btih:one" }));
    mocks.server.current = { state: baseState, completed: "new.iso", completedVersion: 1 };
    rerenderApp(view);
    await act(async () => pending.resolve());

    expect(view.getByRole("status").textContent).toBe("✓ new.iso");
  });

  it("does not let an older clipboard paste replace a newer Store notice", async () => {
    const pending = deferred<string>();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn(() => pending.promise) },
    });
    const view = hydrate();
    openBrowser();

    fireEvent.keyDown(window, { key: "m" });
    act(() => currentStore!.setNotice("newer"));
    await act(async () => pending.resolve(""));

    expect(view.getByRole("status").textContent).toBe("newer");
  });
});

describe("App actions", () => {
  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("does not open the download throttle for a modified r shortcut", (init) => {
    const view = hydrate();
    openBrowser();

    fireEvent.keyDown(window, { key: "r", ...init });

    expect(view.container.querySelector('[data-overlay="download"]')).toBeNull();
  });

  it("keeps the folder prompt and selected cursor after refused removal", async () => {
    mocks.post.mockResolvedValueOnce({ ok: false, notice: "Can't remove the active folder." });
    const state = {
      ...baseState,
      config: { ...baseState.config, downloadDirs: ["/downloads", "/other"] },
    };
    const view = hydrate(state);
    openBrowser();

    fireEvent.keyDown(window, { key: "o" });
    expect(view.container.querySelector('[data-overlay="folder"]')).toBeTruthy();
    fireEvent.keyDown(window, { key: "d" });
    await act(async () => { await Promise.resolve(); });

    expect(view.container.querySelector('[data-overlay="folder"]')).toBeTruthy();
    expect(view.container.querySelector(".prompt-body > .accent")?.textContent).toContain("/downloads");
    expect(view.getByRole("status").textContent).toBe("Can't remove the active folder.");
  });

  it("posts the exact download payload through the Store action", () => {
    hydrate();
    const input = {
      id: "one",
      name: "one.iso",
      magnet: "magnet:?xt=urn:btih:one",
      source: "solid" as const,
      sizeBytes: 123,
    };
    act(() => currentStore!.startDownload(input));
    expect(mocks.post).toHaveBeenCalledWith("/api/downloads", input);
  });

  it("handles missing and rejected clipboard writes without throwing", async () => {
    const view = hydrate();
    openBrowser();
    expect(() => currentStore!.copyMagnet({ name: "one", magnet: "magnet:?xt=urn:btih:one" })).not.toThrow();
    await act(async () => { await Promise.resolve(); });
    expect(view.getByRole("status").textContent).toBe("Couldn't copy magnet for one.");

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await act(async () => currentStore!.copyMagnet({ name: "two", magnet: "magnet:?xt=urn:btih:two" }));
    expect(view.getByRole("status").textContent).toBe("Couldn't copy magnet for two.");
  });

  it("handles missing and rejected clipboard reads with the exact empty notice", async () => {
    const view = hydrate();
    openBrowser();
    await act(async () => fireEvent.keyDown(window, { key: "m" }));
    expect(view.getByRole("status").textContent).toBe("Clipboard is empty.");

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await act(async () => fireEvent.keyDown(window, { key: "m" }));
    expect(view.getByRole("status").textContent).toBe("Clipboard is empty.");
  });

  it("gates global keyboard handling behind overlays", () => {
    const view = hydrate();
    openBrowser();

    act(() => currentStore!.showError(failedItem));
    expect(view.container.querySelector('[data-overlay="error"]')).toBeTruthy();
    fireEvent.keyDown(window, { key: "?" });
    expect(view.container.querySelector("[data-overlay]")).toBeNull();

    fireEvent.keyDown(window, { key: "?" });
    expect(view.container.querySelector('[data-overlay="help"]')).toBeTruthy();
    fireEvent.keyDown(window, { key: "x" });
    expect(view.container.querySelector("[data-overlay]")).toBeNull();

    fireEvent.keyDown(window, { key: "o" });
    expect(view.container.querySelector('[data-overlay="folder"]')).toBeTruthy();
    fireEvent.keyDown(window, { key: "t" });
    expect(view.container.querySelector('[data-overlay="folder"]')).toBeTruthy();
  });
});

describe("App URL state", () => {
  it("deep links to a section with an overlay", () => {
    const view = hydrate(baseState, "/downloads/settings");
    expect(view.container.querySelector('[data-overlay="settings"]')).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Close" }));
    expect(view.container.querySelector("[data-overlay]")).toBeNull();
    expect(view.container.querySelector('[data-section="downloads"]')).toBeTruthy();
    expect(currentPath(view)).toBe("/downloads");
  });

  it("updates the URL when the section changes", () => {
    const view = hydrate();
    openBrowser();
    expect(currentPath(view)).toBe("/all?q=ubuntu");
    act(() => currentStore!.setSection("seeding"));
    expect(currentPath(view)).toBe("/seeding?q=ubuntu");
    expect(view.container.querySelector('[data-section="seeding"]')).toBeTruthy();
  });

  it("tracks the settings sheet in the URL", () => {
    const view = hydrate();
    openBrowser();
    fireEvent.click(view.getByRole("button", { name: "Settings" }));
    expect(view.container.querySelector('[data-overlay="settings"]')).toBeTruthy();
    expect(currentPath(view)).toBe("/all/settings?q=ubuntu");
  });

  it("closes a keyboard overlay back to the section URL", () => {
    const view = hydrate(baseState, "/downloads/help");
    expect(view.container.querySelector('[data-overlay="help"]')).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(view.container.querySelector("[data-overlay]")).toBeNull();
    expect(currentPath(view)).toBe("/downloads");
  });

  it("redirects unknown paths to the splash", () => {
    const view = hydrate(baseState, "/nope");
    expect(view.container.querySelector('[data-view="splash"]')).toBeTruthy();
    expect(currentPath(view)).toBe("/");
  });

  it("restores the search query from the URL", () => {
    const view = hydrate(baseState, "/all?q=dune");
    expect(currentStore?.query).toBe("dune");
    expect(view.container.querySelector('[data-view="browser"]')).toBeTruthy();
  });
});
