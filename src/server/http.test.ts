import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerResponse, type Server } from "node:http";
import { Core } from "./core";
import { createToken, createTorlinkServer } from "./http";

interface Ctx {
  base: string;
  token: string;
  server: Server;
  core: Core;
  quits: number;
  webRoot: string;
}

const ctxs: Ctx[] = [];
const eventStreams: EventStream[] = [];

async function start(): Promise<Ctx> {
  const core = await Core.boot();
  const token = createToken();
  const webRoot = mkdtempSync(join(tmpdir(), "torlink-web-"));
  writeFileSync(join(webRoot, "index.html"), "<p>torlink</p>");
  const ctx: Partial<Ctx> = { token, core, quits: 0, webRoot };
  const server = createTorlinkServer({
    core,
    token,
    webRoot,
    onQuit: () => { ctx.quits = (ctx.quits ?? 0) + 1; },
  });
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
  for (const stream of eventStreams.splice(0)) await stream.cancel();
  for (const ctx of ctxs.splice(0)) {
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.core.suspend();
    rmSync(ctx.webRoot, { recursive: true, force: true });
  }
});

describe("torlink http server", () => {
  it("rejects /api requests without the token", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/downloads`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("accepts the token as query param or header", async () => {
    const { base, token } = await start();
    const query = await fetch(`${base}/api/nope?token=${token}`);
    expect(query.status).toBe(404);
    const header = await fetch(`${base}/api/nope`, {
      headers: { "x-torlink-token": token },
    });
    expect(header.status).toBe(404);
  });

  it("serves the SPA without a token", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("torlink");
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
    const { base, token } = await start();
    const res = await fetch(`${base}/api/downloads?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects authenticated download bodies larger than 1 MiB", async () => {
    const { base, token } = await start();
    const res = await fetch(`${base}/api/downloads?token=${token}`, {
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

  it("quit responds then fires onQuit", async () => {
    const ctx = await start();
    const res = await fetch(`${ctx.base}/api/quit?token=${ctx.token}`, { method: "POST" });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.quits).toBe(1);
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

async function openEventStream(base: string, token: string): Promise<EventStream> {
  const res = await fetch(`${base}/api/events?token=${token}`);
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

describe("GET /api/events", () => {
  it("sends an initial state snapshot and pushes on updates", async () => {
    const { base, token, core } = await start();
    core.config = { ...core.config, maxDownloadKbps: 0 };
    const stream = await openEventStream(base, token);
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
    const { base, token, core } = await start();
    const stream = await openEventStream(base, token);
    await stream.next();

    core.emit("completed", "ubuntu.iso");

    await expect(stream.next()).resolves.toEqual({
      event: "completed",
      data: { name: "ubuntu.iso" },
    });
  });

  it("coalesces rapid updates into one trailing snapshot of the latest state", async () => {
    const { base, token, core } = await start();
    core.config = { ...core.config, maxDownloadKbps: 0 };
    const stream = await openEventStream(base, token);
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
    const { base, token, core } = await start();
    const updateListeners = core.listenerCount("update");
    const completedListeners = core.listenerCount("completed");
    const stream = await openEventStream(base, token);
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
      const { base, token } = await start();
      const stream = await openEventStream(base, token);
      await stream.next();
      expect(errorListenersAtFirstWrite).toBeGreaterThan(0);
    } finally {
      write.mockRestore();
    }
  });

  it("cleans up idempotently on response error followed by close", async () => {
    const { base, token, core, server } = await start();
    const updateListeners = core.listenerCount("update");
    const completedListeners = core.listenerCount("completed");
    let response: ServerResponse | undefined;
    server.on("request", (req, res) => {
      if (req.url?.startsWith("/api/events")) response = res;
    });
    const stream = await openEventStream(base, token);
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
