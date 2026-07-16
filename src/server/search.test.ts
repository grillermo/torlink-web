import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Source, TorrentResult } from "../sources/types";
import { runSearchSse } from "./search";

function fakeRes(): { res: ServerResponse; chunks: string[]; ended: () => boolean } {
  const chunks: string[] = [];
  let ended = false;
  const em = new EventEmitter() as unknown as ServerResponse & EventEmitter;
  Object.assign(em, {
    writeHead: () => em,
    write: (s: string) => { chunks.push(s); return true; },
    end: () => { ended = true; },
  });
  return { res: em, chunks, ended: () => ended };
}

function result(id: string): TorrentResult {
  return {
    infoHash: id, name: id, sizeBytes: 1, seeders: 1, leechers: 0,
    source: "yts", magnet: `magnet:?xt=urn:btih:${id}`,
  };
}

function source(id: Source["id"], search: Source["search"]): Source {
  return { id, label: id, group: "Movies", homepage: "x", search };
}

function parse(chunks: string[]): { event: string; data: unknown }[] {
  return chunks
    .join("")
    .split("\n\n")
    .filter((b) => b.includes("event:"))
    .map((b) => ({
      event: /event: (.*)/.exec(b)![1]!,
      data: JSON.parse(/data: (.*)/.exec(b)![1]!),
    }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runSearchSse", () => {
  it("emits one source event per source then done", async () => {
    const good = source("yts", async () => [result("aa")]);
    const bad = source("solid", async () => { throw new Error("boom"); });
    const { res, chunks, ended } = fakeRes();

    await runSearchSse(res, "ubuntu", { sources: [good, bad] });

    const events = parse(chunks);
    expect(events).toHaveLength(3);
    const bySource = events.filter((e) => e.event === "source");
    expect((bySource.find((e) => (e.data as { sourceId: string }).sourceId === "yts")!.data as {
      items: TorrentResult[];
    }).items).toHaveLength(1);
    const failed = bySource.find((e) => (e.data as { sourceId: string }).sourceId === "solid")!.data as {
      error: string; code: string;
    };
    expect(failed.error).toBe("boom");
    expect(failed.code).toBe("no response");
    expect(events.at(-1)!.event).toBe("done");
    expect(ended()).toBe(true);
  });

  it("starts all sources concurrently and reports each as it settles", async () => {
    let releaseSlow!: () => void;
    const slow = new Promise<TorrentResult[]>((resolve) => { releaseSlow = () => resolve([result("slow")]); });
    let fastStarted = false;
    const { res, chunks } = fakeRes();
    const run = runSearchSse(res, "concurrent", {
      sources: [
        source("yts", async () => slow),
        source("solid", async () => { fastStarted = true; return [result("fast")]; }),
      ],
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fastStarted).toBe(true);
    expect(parse(chunks).map((event) => event.event)).toEqual(["source"]);
    releaseSlow();
    await run;
    expect(parse(chunks).map((event) => event.event)).toEqual(["source", "source", "done"]);
  });

  it("settles with a timeout when the source ignores abort", async () => {
    vi.useFakeTimers();
    let resolveSearch!: (items: TorrentResult[]) => void;
    const ignoredAbort = new Promise<TorrentResult[]>((resolve) => { resolveSearch = resolve; });
    const { res, chunks, ended } = fakeRes();
    const run = runSearchSse(res, "timeout", {
      timeoutMs: 10,
      sources: [source("yts", async () => ignoredAbort)],
    });
    let settled = false;
    void run.then(() => { settled = true; });

    try {
      await vi.advanceTimersByTimeAsync(10);
      expect(settled).toBe(true);
      expect(parse(chunks)).toEqual([
        { event: "source", data: { sourceId: "yts", error: "timed out", code: "timed out" } },
        { event: "done", data: {} },
      ]);
      expect(ended()).toBe(true);
    } finally {
      resolveSearch([]);
      await run;
    }
  });

  it("settles without writes when outer cancellation reaches a source that ignores abort", async () => {
    const ctrl = new AbortController();
    const removeAbortListener = vi.spyOn(ctrl.signal, "removeEventListener");
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    let rejectSearch!: (error: Error) => void;
    const { res, chunks, ended } = fakeRes();
    const run = runSearchSse(res, "cancel", {
      signal: ctrl.signal,
      sources: [source("yts", async () => await new Promise<TorrentResult[]>((_resolve, reject) => {
        rejectSearch = reject;
      }))],
    });

    let settled = false;
    void run.then(() => { settled = true; });

    try {
      ctrl.abort();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(true);
      expect(parse(chunks)).toEqual([]);
      expect(ended()).toBe(true);
      expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(clearTimer).toHaveBeenCalled();
    } finally {
      rejectSearch(new Error("late source rejection"));
      await run;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
});
