import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
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

async function readEvents(
  base: string,
  token: string,
  path: string,
  count: number,
  act?: () => void,
): Promise<{ event: string; data: unknown }[]> {
  const res = await fetch(`${base}${path}?token=${token}`);
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const out: { event: string; data: unknown }[] = [];
  let buf = "";
  act?.();
  while (out.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) out.push({ event, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return out;
}

describe("GET /api/events", () => {
  it("sends an initial state snapshot and pushes on updates", async () => {
    const { base, token, core } = await start();
    core.setThrottle("download", "0");
    const events = await readEvents(base, token, "/api/events", 2, () => {
      core.setThrottle("download", "123");
    });
    expect(events[0]!.event).toBe("state");
    const first = events[0]!.data as { config: { maxDownloadKbps: number } };
    expect(first.config.maxDownloadKbps).toBe(0);
    const second = events[1]!.data as { config: { maxDownloadKbps: number } };
    expect(second.config.maxDownloadKbps).toBe(123);
  });
});
