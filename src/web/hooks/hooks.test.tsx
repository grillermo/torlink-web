// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../server/state";
import type { SourceId, TorrentResult } from "../../sources/types";
import { useConcurrentSearch } from "./useConcurrentSearch";
import { useServerState } from "./useServerState";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown = {}): void {
    const event = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
  }

  error(): void {
    this.onerror?.(new Event("error"));
  }
}

const appState: AppState = {
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

function torrent(source: SourceId, overrides: Partial<TorrentResult> = {}): TorrentResult {
  return {
    infoHash: `${source}-hash`,
    name: `${source} result`,
    sizeBytes: 1024,
    seeders: 10,
    leechers: 2,
    source,
    magnet: `magnet:?xt=urn:btih:${source}-hash`,
    ...overrides,
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useServerState", () => {
  it("parses state and completed events, ignores malformed data, and closes StrictMode streams", () => {
    const { result, unmount } = renderHook(() => useServerState(), { reactStrictMode: true });

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    const stream = FakeEventSource.instances[1]!;
    expect(stream.url).toBe("/api/events");

    act(() => stream.emit("state", "{"));
    expect(result.current.state).toBeNull();
    act(() => stream.emit("state", appState));
    expect(result.current.state).toEqual(appState);

    act(() => stream.emit("completed", "{"));
    expect(result.current.completed).toBeNull();
    act(() => stream.emit("completed", { name: "finished.iso" }));
    expect(result.current.completed).toBe("finished.iso");
    expect(result.current.completedVersion).toBe(1);

    act(() => stream.emit("completed", { name: "finished.iso" }));
    expect(result.current.completed).toBe("finished.iso");
    expect(result.current.completedVersion).toBe(2);

    unmount();
    expect(stream.closed).toBe(true);
  });
});

describe("useConcurrentSearch", () => {
  it("closes stale streams and ignores their events after the query changes", () => {
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useConcurrentSearch(query),
      { initialProps: { query: "old" } },
    );
    const oldStream = FakeEventSource.instances[0]!;

    rerender({ query: "new" });
    const newStream = FakeEventSource.instances[1]!;
    expect(oldStream.closed).toBe(true);
    expect(newStream.url).toBe("/api/search?q=new");

    act(() => oldStream.emit("source", { sourceId: "fitgirl", items: [torrent("fitgirl")] }));
    expect(result.current.done).toBe(0);
    expect(result.current.results).toEqual([]);

    act(() => newStream.emit("source", { sourceId: "fitgirl", items: [torrent("fitgirl")] }));
    expect(result.current.done).toBe(1);
    expect(result.current.results).toHaveLength(1);
  });

  it("does not count duplicate source events more than once", () => {
    const { result } = renderHook(() => useConcurrentSearch("query"));
    const stream = FakeEventSource.instances[0]!;

    act(() => {
      stream.emit("source", { sourceId: "fitgirl", items: [torrent("fitgirl")] });
      stream.emit("source", { sourceId: "fitgirl", items: [torrent("fitgirl")] });
    });

    expect(result.current.done).toBe(1);
    expect(result.current.total).toBe(10);
  });

  it("ignores malformed, prototype, and unknown source events", () => {
    const { result } = renderHook(() => useConcurrentSearch("query"));
    const stream = FakeEventSource.instances[0]!;

    act(() => {
      stream.emit("source", "{");
      stream.emit("source", null);
      stream.emit("source", { sourceId: "__proto__", items: [] });
      stream.emit("source", { sourceId: "toString", items: [] });
      stream.emit("source", { sourceId: "unknown", items: [] });
      stream.emit("source", { sourceId: "fitgirl", items: "not-an-array" });
      stream.emit("source", { sourceId: "fitgirl", items: [null] });
      stream.emit("source", { sourceId: "fitgirl", error: "failed", code: 500 });
    });

    expect(result.current.done).toBe(0);
    expect(result.current.results).toEqual([]);
    expect(result.current.perSource.fitgirl).toEqual({
      loading: true,
      error: null,
      code: null,
      count: 0,
    });
    expect(Object.prototype.hasOwnProperty.call(result.current.perSource, "toString")).toBe(false);
  });

  it("closes and stops loading on done without finalizing on an earlier error", () => {
    const { result } = renderHook(() => useConcurrentSearch("query"));
    const stream = FakeEventSource.instances[0]!;

    act(() => stream.error());
    expect(stream.closed).toBe(false);
    expect(result.current.loading).toBe(true);

    act(() => stream.emit("done"));
    expect(stream.closed).toBe(true);
    expect(result.current.loading).toBe(false);
  });
});
