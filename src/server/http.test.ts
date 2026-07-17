import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerResponse, type Server } from "node:http";
const stateDir = mkdtempSync(join(tmpdir(), "torlink-http-state-"));
process.env.TORLINK_STATE_DIR = stateDir;
const { Core } = await import("./core");
const { createTorlinkServer } = await import("./http");
type CoreInstance = Awaited<ReturnType<typeof Core.boot>>;

const searchHarness = vi.hoisted(() => ({
  mode: "resolve" as "resolve" | "pending" | "deferred",
  calls: [] as string[],
  signals: [] as AbortSignal[],
  releases: [] as Array<() => void>,
}));

vi.mock("../sources/registry", () => ({
  SOURCES: [{
    id: "yts",
    label: "YTS",
    group: "Movies",
    homepage: "https://example.test",
    search: async (query: string, opts?: { signal?: AbortSignal }) => {
      searchHarness.calls.push(query);
      if (opts?.signal) searchHarness.signals.push(opts.signal);
      const item = {
        infoHash: "http-result",
        name: "HTTP result",
        sizeBytes: 1,
        seeders: 1,
        leechers: 0,
        source: "yts",
        magnet: "magnet:?xt=urn:btih:http-result",
      };
      if (searchHarness.mode === "pending") {
        return await new Promise<never>(() => {});
      }
      if (searchHarness.mode === "deferred") {
        return await new Promise<typeof item[]>((resolve) => {
          searchHarness.releases.push(() => resolve([item]));
        });
      }
      return [item];
    },
  }],
}));

interface Ctx {
  base: string;
  server: Server;
  core: CoreInstance;
  webRoot: string;
}

const ctxs: Ctx[] = [];
const eventStreams: EventStream[] = [];

async function start(): Promise<Ctx> {
  const core = await Core.boot();
  const webRoot = mkdtempSync(join(tmpdir(), "torlink-web-"));
  writeFileSync(join(webRoot, "index.html"), "<p>torlink</p>");
  const ctx: Partial<Ctx> = { core, webRoot };
  const server = createTorlinkServer({ core, webRoot });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  ctx.base = `http://127.0.0.1:${addr.port}`;
  ctx.server = server;
  ctxs.push(ctx as Ctx);
  return ctx as Ctx;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  searchHarness.mode = "resolve";
  searchHarness.calls.length = 0;
  searchHarness.signals.length = 0;
  searchHarness.releases.length = 0;
  for (const stream of eventStreams.splice(0)) await stream.cancel();
  for (const ctx of ctxs.splice(0)) {
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.core.suspend();
    rmSync(ctx.webRoot, { recursive: true, force: true });
  }
});

afterAll(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

describe("torlink http server", () => {
  it("returns 404 for unknown /api routes", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
  });

  it("serves the SPA", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("torlink");
  });

  it("serves the SPA for extensionless client routes", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/downloads/settings`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("torlink");
  });

  it("returns 404 for unknown paths with a file extension", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/nope.png`);
    expect(res.status).toBe(404);
  });

  it("blocks path traversal out of webRoot", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/assets/..%2f..%2f..%2fetc%2fpasswd`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed percent-encoded static paths", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/assets/%`);
    expect(res.status).toBe(404);
  });

  it("validates download input", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/downloads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects download bodies larger than 1 MiB", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/downloads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "large",
        name: "large",
        magnet: `magnet:?xt=urn:btih:${"0".repeat(40)}`,
        padding: "x".repeat(1024 * 1024),
      }),
    });
    expect(res.status).toBe(413);
  });

  it("exposes no endpoint that shuts the server down", async () => {
    const ctx = await start();
    const res = await fetch(`${ctx.base}/api/quit`, { method: "POST" });
    expect(res.status).toBe(404);
    const still = await fetch(`${ctx.base}/`);
    expect(still.status).toBe(200);
  });
});

interface SseEvent {
  event: string;
  data: unknown;
}

interface EventStream {
  next: () => Promise<SseEvent>;
  cancel: () => Promise<void>;
}

async function openEventStream(base: string): Promise<EventStream> {
  const res = await fetch(`${base}/api/events`);
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const queued: SseEvent[] = [];
  const decoder = new TextDecoder();
  let buf = "";
  let cancelled = false;
  const stream: EventStream = {
    next: async () => {
      while (queued.length === 0) {
        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream ended before the next event");
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) queued.push({ event, data: JSON.parse(data) });
        }
      }
      return queued.shift()!;
    },
    cancel: async () => {
      if (cancelled) return;
      cancelled = true;
      await reader.cancel();
    },
  };
  eventStreams.push(stream);
  return stream;
}

async function nextEventLoopTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitForCondition(check: () => boolean): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) {
    if (check()) return;
    await nextEventLoopTurn();
  }
  expect(check()).toBe(true);
}

function parseSseText(text: string): SseEvent[] {
  return text
    .split("\n\n")
    .filter((block) => block.includes("event:"))
    .map((block) => ({
      event: /^event: (.*)$/m.exec(block)![1]!,
      data: JSON.parse(/^data: (.*)$/m.exec(block)![1]!),
    }));
}

describe("GET /api/search", () => {
  it("completes a deterministic SSE search", async () => {
    const { base } = await start();
    const response = await fetch(`${base}/api/search?q=http-normal`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(parseSseText(await response.text())).toEqual([
      {
        event: "source",
        data: {
          sourceId: "yts",
          items: [{
            infoHash: "http-result",
            name: "HTTP result",
            sizeBytes: 1,
            seeders: 1,
            leechers: 0,
            source: "yts",
            magnet: "magnet:?xt=urn:btih:http-result",
          }],
        },
      },
      { event: "done", data: {} },
    ]);
    expect(searchHarness.calls).toEqual(["http-normal"]);
  });

  it("aborts and removes response listeners after client disconnect", async () => {
    searchHarness.mode = "pending";
    const { base, server } = await start();
    let response: ServerResponse | undefined;
    server.on("request", (req, res) => {
      if (req.url?.startsWith("/api/search")) response = res;
    });
    const clientResponse = await fetch(`${base}/api/search?q=http-disconnect`);
    try {
      expect(response).toBeDefined();
      expect(response!.listenerCount("close")).toBeGreaterThan(0);
      expect(response!.listenerCount("error")).toBeGreaterThan(0);
    } finally {
      await clientResponse.body!.cancel();
      await waitForCondition(() => searchHarness.signals[0]?.aborted === true);
    }
    await waitForCondition(() =>
      response!.listenerCount("close") === 0 && response!.listenerCount("error") === 0,
    );

    expect(searchHarness.signals[0]!.aborted).toBe(true);
  });

  it("cleans up idempotently on response error followed by close", async () => {
    searchHarness.mode = "pending";
    const { base, server } = await start();
    let response: ServerResponse | undefined;
    server.on("request", (req, res) => {
      if (req.url?.startsWith("/api/search")) response = res;
    });
    const clientResponse = await fetch(`${base}/api/search?q=http-error`);

    expect(response).toBeDefined();
    let emittedError: unknown;
    try {
      response!.emit("error", new Error("test search response error"));
    } catch (error: unknown) {
      emittedError = error;
    } finally {
      response!.emit("close");
      await clientResponse.body!.cancel().catch(() => {});
      await waitForCondition(() => searchHarness.signals[0]?.aborted === true);
    }

    expect(emittedError).toBeUndefined();
    expect(response!.listenerCount("close")).toBe(0);
    expect(response!.listenerCount("error")).toBe(0);
  });

  it("observes a terminal SSE failure after headers start", async () => {
    searchHarness.mode = "deferred";
    const { base, server } = await start();
    let response: ServerResponse | undefined;
    server.on("request", (req, res) => {
      if (req.url?.startsWith("/api/search")) response = res;
    });
    const clientResponse = await fetch(`${base}/api/search?q=http-write-error`);
    expect(response).toBeDefined();
    const destroy = vi.spyOn(response!, "destroy");
    response!.write = () => { throw new Error("test terminal SSE write failure"); };

    try {
      searchHarness.releases[0]!();
      await waitForCondition(() => destroy.mock.calls.length > 0);

      expect(response!.listenerCount("close")).toBe(0);
      expect(response!.listenerCount("error")).toBe(0);
      await expect(clientResponse.text()).rejects.toThrow();
    } finally {
      if (!response!.destroyed) response!.destroy();
    }
  });
});

describe("GET /api/events", () => {
  it("sends an initial state snapshot and pushes on updates", async () => {
    const { base, core } = await start();
    core.config = { ...core.config, maxDownloadKbps: 0 };
    const stream = await openEventStream(base);
    const initial = await stream.next();
    core.config = { ...core.config, maxDownloadKbps: 123 };
    core.emit("update");
    const updated = await stream.next();

    expect(initial.event).toBe("state");
    const first = initial.data as { config: { maxDownloadKbps: number } };
    expect(first.config.maxDownloadKbps).toBe(0);
    const second = updated.data as { config: { maxDownloadKbps: number } };
    expect(second.config.maxDownloadKbps).toBe(123);
  });

  it("forwards completed events immediately", async () => {
    const { base, core } = await start();
    const stream = await openEventStream(base);
    await stream.next();

    core.emit("completed", "ubuntu.iso");

    await expect(stream.next()).resolves.toEqual({
      event: "completed",
      data: { name: "ubuntu.iso" },
    });
  });

  it("coalesces rapid updates into one trailing snapshot of the latest state", async () => {
    const { base, core } = await start();
    core.config = { ...core.config, maxDownloadKbps: 0 };
    const stream = await openEventStream(base);
    await stream.next();

    vi.useFakeTimers();
    for (const maxDownloadKbps of [1, 2, 3]) {
      core.config = { ...core.config, maxDownloadKbps };
      core.emit("update");
    }
    const trailingEvent = stream.next();
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    const event = await trailingEvent;
    expect(event.event).toBe("state");
    const state = event.data as { config: { maxDownloadKbps: number } };
    expect(state.config.maxDownloadKbps).toBe(3);

    let extraEventSettled = false;
    const extraEvent = stream.next().then(
      () => { extraEventSettled = true; },
      () => { extraEventSettled = true; },
    );
    await nextEventLoopTurn();
    await nextEventLoopTurn();
    expect(extraEventSettled).toBe(false);
    await stream.cancel();
    await extraEvent;
  });

  it("removes Core listeners after client cancellation", async () => {
    const { base, core } = await start();
    const updateListeners = core.listenerCount("update");
    const completedListeners = core.listenerCount("completed");
    const stream = await openEventStream(base);
    await stream.next();
    expect(core.listenerCount("update")).toBe(updateListeners + 1);
    expect(core.listenerCount("completed")).toBe(completedListeners + 1);

    core.emit("update");
    await stream.cancel();
    await waitForCondition(() =>
      core.listenerCount("update") === updateListeners
      && core.listenerCount("completed") === completedListeners,
    );

    expect(core.listenerCount("update")).toBe(updateListeners);
    expect(core.listenerCount("completed")).toBe(completedListeners);
  });

  it("registers response error cleanup before the initial SSE write", async () => {
    const originalWrite = ServerResponse.prototype.write;
    let errorListenersAtFirstWrite: number | undefined;
    const write = vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (
      this: ServerResponse,
      ...args: Parameters<typeof originalWrite>
    ) {
      errorListenersAtFirstWrite ??= this.listenerCount("error");
      return Reflect.apply(originalWrite, this, args) as boolean;
    });
    try {
      const { base } = await start();
      const stream = await openEventStream(base);
      await stream.next();
      expect(errorListenersAtFirstWrite).toBeGreaterThan(0);
    } finally {
      write.mockRestore();
    }
  });

  it("cleans up idempotently on response error followed by close", async () => {
    const { base, core, server } = await start();
    const updateListeners = core.listenerCount("update");
    const completedListeners = core.listenerCount("completed");
    let response: ServerResponse | undefined;
    server.on("request", (req, res) => {
      if (req.url?.startsWith("/api/events")) response = res;
    });
    const stream = await openEventStream(base);
    await stream.next();

    expect(response).toBeDefined();
    expect(() => response!.emit("error", new Error("test response error"))).not.toThrow();
    response!.emit("close");
    await waitForCondition(() =>
      core.listenerCount("update") === updateListeners
      && core.listenerCount("completed") === completedListeners,
    );

    expect(core.listenerCount("update")).toBe(updateListeners);
    expect(core.listenerCount("completed")).toBe(completedListeners);
  });
});

describe("action routes", () => {
  it("download lifecycle routes are tolerant of unknown ids", async () => {
    const { base } = await start();
    for (const action of ["pause", "resume", "cancel", "retry"]) {
      const res = await fetch(`${base}/api/downloads/nope/${action}`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
    }
  });

  it("throttle route validates direction and applies", async () => {
    const { base, core } = await start();
    const bad = await fetch(`${base}/api/config/throttle`, {
      method: "POST",
      body: JSON.stringify({ direction: "sideways", value: "5" }),
    });
    expect(bad.status).toBe(400);
    const ok = await fetch(`${base}/api/config/throttle`, {
      method: "POST",
      body: JSON.stringify({ direction: "download", value: "250" }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json() as { notice: string }).notice).toBe("Throttle: ↓ 250 KB/s");
    expect(core.config.maxDownloadKbps).toBe(250);
  });

  it("trackers and folder routes round-trip through Core", async () => {
    const { base, core } = await start();
    const t = await fetch(`${base}/api/config/trackers`, {
      method: "POST",
      body: JSON.stringify({ urls: ["udp://x:1"] }),
    });
    expect((await t.json() as { notice: string }).notice).toBe("Saved 1 tracker.");
    const f = await fetch(`${base}/api/config/folder`, {
      method: "POST",
      body: JSON.stringify({ action: "remove", dir: core.config.downloadDir }),
    });
    expect((await f.json() as { notice: string }).notice).toBe("Can't remove the active folder.");
  });

  it("seed resume 404s for an id with no history", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/seeds/nope/resume`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown id" });
  });
});
