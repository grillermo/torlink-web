// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import type { TorrentResult } from "../../sources/types";
import { StoreContext, type Store } from "../store";
import { Splash } from "../views/Splash";
import { Downloads } from "./Downloads";
import { FolderPrompt } from "./FolderPrompt";
import { Results } from "./Results";
import { Seeding } from "./Seeding";
import { ThrottlePrompt } from "./ThrottlePrompt";
import { TrackersPrompt } from "./TrackersPrompt";

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

const results: TorrentResult[] = [
  { infoHash: "one", name: "Movie small", sizeBytes: 1_000, seeders: 2, leechers: 1, source: "yts", magnet: "magnet:?one", added: 1 },
  { infoHash: "two", name: "Movie large", sizeBytes: 2_000, seeders: 8, leechers: 3, source: "tpb-movies", magnet: "magnet:?two", added: 2 },
];

const state: AppState = {
  config: { downloadDir: "/downloads", downloadDirs: ["/downloads", "/media"], trackers: [], maxDownloadKbps: 0, maxUploadKbps: 0 },
  queue: [
    { id: "down", name: "Downloading", magnet: "magnet:?down", dir: "/downloads", status: "downloading", progress: 50, totalBytes: 1_000, downloadedBytes: 500, speed: 100, peers: 2, addedAt: 1 },
    { id: "failed", name: "Failed", magnet: "magnet:?failed", dir: "/downloads", status: "failed", progress: 0, totalBytes: 0, downloadedBytes: 0, speed: 0, peers: 0, error: "disk full", addedAt: 1 },
  ],
  seeds: [
    { id: "recent", name: "Recent", magnet: "magnet:?recent", dir: "/downloads", sizeBytes: 2_000, status: "seeding", uploadSpeed: 512, uploaded: 2_000, peers: 3 },
  ],
  history: [{ id: "recent", name: "Recent", magnet: "magnet:?recent", dir: "/downloads", sizeBytes: 2_000, completedAt: 1 }],
};

function storeFor(overrides: Partial<Store> = {}): Store {
  return {
    config: state.config, state, view: "browser", setView: vi.fn(), query: "ubuntu", submitQuery: vi.fn(),
    section: "all", setSection: vi.fn(), region: "content", setRegion: vi.fn(),
    captureMode: "none", setCaptureMode: vi.fn(), downloadFocus: null, setDownloadFocus: vi.fn(),
    seedFocus: null, setSeedFocus: vi.fn(), startDownload: vi.fn(), cancelDownload: vi.fn(),
    toggleDownload: vi.fn(), retryFailed: vi.fn(), removeHistory: vi.fn(), clearHistory: vi.fn(),
    toggleSeed: vi.fn(), copyMagnet: vi.fn(), showError: vi.fn(), notice: null, setNotice: vi.fn(),
    ...overrides,
  };
}

function renderWith(store: Store, children: React.ReactNode) {
  return render(<StoreContext.Provider value={store}>{children}</StoreContext.Provider>);
}

afterEach(() => {
  cleanup();
  search.current = { results: [], perSource: {}, loading: false, done: 10, total: 10 };
});

describe("Results touch actions", () => {
  it("dispatches download and copy from the selected row's strip", () => {
    search.current = { ...search.current, results };
    const store = storeFor();
    const view = renderWith(store, <Results />);
    const strip = view.getByRole("group", { name: "Result actions" });

    fireEvent.click(within(strip).getByRole("button", { name: "download" }));
    expect(store.startDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "one" }));
    fireEvent.click(within(strip).getByRole("button", { name: "copy" }));
    expect(store.copyMagnet).toHaveBeenCalledWith({ name: "Movie small", magnet: "magnet:?one" });
  });

  it("opens the detail on a second tap and closes it with the back button", () => {
    search.current = { ...search.current, results };
    const view = renderWith(storeFor(), <Results />);
    const row = view.getByRole("button", { name: /Movie small/ });

    fireEvent.click(row);
    expect(view.getByText("Hash")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "back" }));
    expect(view.queryByText("Hash")).toBeNull();
  });

  it("downloads from the detail's buttons", () => {
    search.current = { ...search.current, results };
    const store = storeFor();
    const view = renderWith(store, <Results />);

    fireEvent.click(view.getByRole("button", { name: "details" }));
    fireEvent.click(view.getByRole("button", { name: "download" }));
    expect(store.startDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "one" }));
    fireEvent.click(view.getByRole("button", { name: "copy magnet" }));
    expect(store.copyMagnet).toHaveBeenCalledWith({ name: "Movie small", magnet: "magnet:?one" });
  });

  it("sorts by a tapped header and flips direction on the next tap", () => {
    search.current = { ...search.current, results };
    const view = renderWith(storeFor(), <Results />);
    const rows = () => within(view.container.querySelector(".result-list") as HTMLElement)
      .getAllByRole("button", { name: /Movie/ }).map((row) => row.textContent);

    fireEvent.click(view.getByRole("button", { name: "Size" }));
    expect(rows()).toEqual([expect.stringContaining("Movie small"), expect.stringContaining("Movie large")]);
    fireEvent.click(view.getByRole("button", { name: /Size/ }));
    expect(rows()).toEqual([expect.stringContaining("Movie large"), expect.stringContaining("Movie small")]);
  });
});

describe("Downloads touch actions", () => {
  it("pauses and cancels the selected active row from its strip", () => {
    const store = storeFor({ section: "downloads" });
    const view = renderWith(store, <Downloads />);
    const strip = view.getByRole("group", { name: "Download actions" });

    fireEvent.click(within(strip).getByRole("button", { name: "pause" }));
    expect(store.toggleDownload).toHaveBeenCalledWith("down", "pause");
    fireEvent.click(within(strip).getByRole("button", { name: "cancel" }));
    expect(store.cancelDownload).toHaveBeenCalledWith("down");
  });

  it("offers error, retry, and remove on a failed row", () => {
    const store = storeFor({ section: "downloads" });
    const view = renderWith(store, <Downloads />);

    fireEvent.click(view.getByRole("button", { name: /Failed/ }));
    const strip = view.getByRole("group", { name: "Download actions" });
    fireEvent.click(within(strip).getByRole("button", { name: "error" }));
    expect(store.showError).toHaveBeenCalledWith(expect.objectContaining({ id: "failed" }));
    fireEvent.click(within(strip).getByRole("button", { name: "retry" }));
    expect(store.retryFailed).toHaveBeenCalledOnce();
    fireEvent.click(within(strip).getByRole("button", { name: "remove" }));
    expect(store.cancelDownload).toHaveBeenCalledWith("failed");
  });

  it("re-downloads and removes a recent row, and clears all history", () => {
    const store = storeFor({ section: "downloads" });
    const view = renderWith(store, <Downloads />);

    fireEvent.click(view.getByRole("button", { name: /Recent/ }));
    const strip = view.getByRole("group", { name: "Recent download actions" });
    fireEvent.click(within(strip).getByRole("button", { name: "download again" }));
    expect(store.startDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "recent" }));
    fireEvent.click(within(strip).getByRole("button", { name: "remove" }));
    expect(store.removeHistory).toHaveBeenCalledWith("recent");
    fireEvent.click(view.getByRole("button", { name: "clear all" }));
    expect(store.clearHistory).toHaveBeenCalledOnce();
  });
});

describe("Seeding touch actions", () => {
  it("pauses and removes the selected seed from its strip", () => {
    const store = storeFor({ section: "seeding" });
    const view = renderWith(store, <Seeding />);
    const strip = view.getByRole("group", { name: "Seed actions" });

    fireEvent.click(within(strip).getByRole("button", { name: "pause" }));
    expect(store.toggleSeed).toHaveBeenCalledWith("recent", "pause");
    fireEvent.click(within(strip).getByRole("button", { name: "remove" }));
    expect(store.removeHistory).toHaveBeenCalledWith("recent");
  });
});

describe("Prompt touch actions", () => {
  it("activates, removes, and adds folders by tap", () => {
    const onActivate = vi.fn();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const view = render(<FolderPrompt
      active="/downloads"
      dirs={["/downloads", "/media"]}
      onActivate={onActivate}
      onAdd={onAdd}
      onCancel={vi.fn()}
      onRemove={onRemove}
      width={60}
    />);

    fireEvent.click(view.getByRole("button", { name: "/media" }));
    expect(onActivate).toHaveBeenCalledWith("/media");
    fireEvent.click(view.getByRole("button", { name: "Remove /media" }));
    expect(onRemove).toHaveBeenCalledWith("/media");

    fireEvent.click(view.getByRole("button", { name: /add new folder/ }));
    fireEvent.change(view.getByLabelText("Add download folder"), { target: { value: "/new" } });
    fireEvent.click(view.getByRole("button", { name: "add" }));
    expect(onAdd).toHaveBeenCalledWith("/new");
  });

  it("closes the folder prompt by tap", () => {
    const onCancel = vi.fn();
    const view = render(<FolderPrompt
      active="/downloads" dirs={["/downloads"]} onActivate={vi.fn()} onAdd={vi.fn()}
      onCancel={onCancel} onRemove={vi.fn()} width={60}
    />);
    fireEvent.click(view.getByRole("button", { name: "close" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("saves and cancels trackers by tap", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const view = render(<TrackersPrompt onCancel={onCancel} onSubmit={onSubmit} value={[]} width={60} />);

    fireEvent.change(view.getByRole("textbox"), { target: { value: "udp://a:1, udp://b:2" } });
    fireEvent.click(view.getByRole("button", { name: "save" }));
    expect(onSubmit).toHaveBeenCalledWith(["udp://a:1", "udp://b:2"]);
    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("saves and cancels the throttle by tap", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const view = render(<ThrottlePrompt direction="download" onCancel={onCancel} onSubmit={onSubmit} value="0" width={40} />);

    fireEvent.change(view.getByRole("textbox"), { target: { value: "500" } });
    fireEvent.click(view.getByRole("button", { name: "save" }));
    expect(onSubmit).toHaveBeenCalledWith("500");
    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("Splash touch actions", () => {
  it("enters the browser by tapping browse everything", () => {
    const store = storeFor({ view: "splash", query: "" });
    const view = renderWith(store, <Splash />);
    fireEvent.click(view.getByRole("button", { name: "browse everything" }));
    expect(store.submitQuery).toHaveBeenCalledWith("");
  });
});
