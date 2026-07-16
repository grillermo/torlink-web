# Web UI Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ink TUI with a browser UI served by a local HTTP server — no new features, closest possible rewrite.

**Architecture:** `npx torlnk` boots the existing core (config, DownloadQueue, sources), starts a plain `node:http` server on 127.0.0.1 with a per-run auth token, and opens the browser to a React SPA (built with Vite, served statically). Live state flows over one SSE stream of full snapshots; searches stream per-source over their own SSE; actions are JSON POSTs.

**Tech Stack:** Node 22, TypeScript, plain `node:http`, React 19 + Vite SPA, vitest (+ jsdom & @testing-library/react for web components), tsup for the server bundle.

**Spec:** `docs/superpowers/specs/2026-07-16-web-ui-rewrite-design.md`

## Spec amendments (discovered while planning — spec file updated to match)

1. **`/api/fs/list` dropped.** The TUI FolderPrompt never browses the filesystem — it picks from the saved `config.downloadDirs` list and adds new folders by typed path (`src/ui/components/FolderPrompt.tsx`). No new features, so no FS-browsing endpoint.
2. **Token guards `/api/*` only; static files are public.** Sub-resource requests (JS/CSS assets) can't carry the query token. The API is what matters; the SPA code is not secret.
3. **No `category` param on `/api/search`.** The current search hook (`src/ui/hooks/useConcurrentSearch.ts`) always queries all sources; category filtering is client-side and ports with the components.
4. **Terminal-size plumbing (`listRows`, `compact`, `cols`, `rows`, `contentWidth`) is not ported.** Lists scroll with CSS (`overflow-y: auto`) and keep the selection visible with `scrollIntoView`. This replaces the TUI's manual windowing, which only existed because terminals can't scroll.

## Global Constraints

- **No new features.** Every behavior must have a TUI equivalent; anything else is out of scope.
- Runtime dependencies exactly: `env-paths`, `parse-torrent`, `webtorrent`. Everything else (react, react-dom, vite, etc.) is a devDependency — the SPA ships prebuilt in `dist/web/`.
- Server framework: plain `node:http`. No express/fastify/hono.
- Bind `127.0.0.1` only. Random free port (`listen(0)`), overridable via `TORLINK_PORT` for dev. Per-run random token, overridable via `TORLINK_TOKEN` for dev.
- Node >= 22 (existing `engines` field).
- Notice copy (user-facing strings like `Download folder unchanged.`) is preserved **verbatim** from App.tsx.
- Tests run with `npx vitest run <file>`; the whole suite with `npm test`. `TORLINK_STATE_DIR` is already redirected to a temp dir by `vitest.config.ts` — never write to the real state dir from tests.
- Commit after every task (message given per task). Work on a branch: `git checkout -b feat/web-ui` before Task 1.
- `npm run typecheck` must pass at every commit.

## File Structure

```
src/
  index.ts                 # NEW cli entry (replaces src/index.tsx)
  server/
    core.ts                # boot + action methods over queue/config (extracted from App.tsx)
    core.test.ts
    state.ts               # AppState snapshot type + serializer
    state.test.ts
    http.ts                # createTorlinkServer: routing, token gate, static, SSE endpoints
    http.test.ts
    search.ts              # /api/search SSE handler logic
    search.test.ts
    sse.ts                 # tiny SSE write helpers
    open.ts                # openBrowser(url) via child_process
  web/
    index.html
    main.tsx               # mount + token bootstrap
    api.ts                 # token handling, action POST helper
    hooks/useServerState.ts    # /api/events EventSource -> AppState
    hooks/useConcurrentSearch.ts  # ported hook, SSE-backed (dedupe/order logic kept verbatim)
    store.ts               # Store context (adapted: no queue object, no terminal sizing)
    keyboard.ts            # window keydown dispatcher (App.tsx useInput logic)
    theme.css              # palette from src/ui/theme.ts as CSS custom properties
    App.tsx                # shell (port of src/ui/App.tsx render tree)
    components/*.tsx       # 1:1 ports (see Task 12+)
    views/Splash.tsx
vite.config.ts
```

Shared code imported by BOTH server and web bundles (Vite handles TS imports outside `src/web/` fine): `src/ui/sort.ts`, `src/ui/keymap.ts` (moved to `src/web/` in Task 17 when `src/ui` is deleted — until then web imports from `src/ui/`; Task 17 moves them), `src/util/format.ts`, `src/sources/magnet.ts` (pure string code), `src/ui/theme.ts` (pure data), types from `src/download/types.ts`, `src/download/history.ts`, `src/config/config.ts`, `src/sources/types.ts` (type-only imports).

---

### Task 1: State snapshot module

**Files:**
- Create: `src/server/state.ts`
- Test: `src/server/state.test.ts`

**Interfaces:**
- Consumes: `DownloadQueue` (`src/download/queue.ts`), `Config` (`src/config/config.ts`).
- Produces: `interface AppState { queue: QueueItem[]; seeds: SeedItem[]; history: HistoryItem[]; config: Config }` and `snapshot(queue: DownloadQueue, config: Config): AppState`. Later tasks (SSE endpoint, web hooks) rely on exactly these names.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/state.test.ts
import { describe, expect, it } from "vitest";
import { DownloadQueue } from "../download/queue";
import { defaultConfig } from "../config/config";
import { snapshot } from "./state";

describe("snapshot", () => {
  it("serializes queue, seeds, history and config into plain arrays", () => {
    const q = new DownloadQueue();
    q.restoreHistory([
      {
        id: "abc",
        name: "thing",
        sizeBytes: 10,
        magnet: "magnet:?xt=urn:btih:abc",
        dir: "/tmp",
        completedAt: 1,
      },
    ]);
    const s = snapshot(q, { ...defaultConfig });
    expect(s.queue).toEqual([]);
    expect(s.seeds).toEqual([]);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.id).toBe("abc");
    expect(s.config.maxDownloadKbps).toBe(0);
    // must survive JSON round-trip (it is sent over SSE)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    q.suspend();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/state.test.ts`
Expected: FAIL — `Cannot find module './state'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/state.ts
import type { Config } from "../config/config";
import type { DownloadQueue } from "../download/queue";
import type { HistoryItem } from "../download/history";
import type { QueueItem, SeedItem } from "../download/types";

export interface AppState {
  queue: QueueItem[];
  seeds: SeedItem[];
  history: HistoryItem[];
  config: Config;
}

export function snapshot(queue: DownloadQueue, config: Config): AppState {
  return {
    queue: queue.getItems(),
    seeds: queue.getSeeds(),
    history: queue.getHistory(),
    config,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/state.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/server/state.ts src/server/state.test.ts
git commit -m "feat(server): add AppState snapshot module"
```

---

### Task 2: Core boot + action methods

Extract App.tsx's boot wiring and action callbacks into a UI-free class. This is the single owner of config + queue; both the TUI-era behaviors and notice strings are preserved verbatim.

**Files:**
- Create: `src/server/core.ts`
- Test: `src/server/core.test.ts`

**Interfaces:**
- Consumes: `loadConfig/saveConfig/normalizeDirList` (`src/config/config.ts`), `normalizeDownloadDir` (`src/config/folder.ts`), `DownloadQueue`/`AddInput` (`src/download/queue.ts`), `loadQueue/loadSeeds` (`src/download/persist.ts`), `loadHistory` (`src/download/history.ts`), `reconcileQueue` (`src/download/reconcile.ts`), `cleanText/truncate` (`src/util/format.ts`).
- Produces (later tasks call exactly these):

```ts
export interface ActionResult { ok: boolean; notice: string }
export class Core extends EventEmitter {
  config: Config;
  queue: DownloadQueue;
  static boot(): Promise<Core>;
  startDownload(input: AddInput): Promise<ActionResult>;
  setTrackers(list: string[]): ActionResult;
  setThrottle(direction: "download" | "upload", raw: string): ActionResult;
  useFolder(raw: string): Promise<ActionResult>;   // activate-or-add, App.tsx setDownloadDir/addFolder merged
  removeFolder(dir: string): ActionResult;
  suspend(): void;                                  // queue.suspend()
}
// Core emits "update" (forwarded queue updates + own config changes)
// and "completed" (name: string), forwarded from the queue.
```

- [ ] **Step 1: Write the failing test**

```ts
// src/server/core.test.ts
import { describe, expect, it, afterEach } from "vitest";
import { Core } from "./core";

const cores: Core[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.suspend();
});

async function boot(): Promise<Core> {
  const c = await Core.boot();
  cores.push(c);
  return c;
}

describe("Core actions", () => {
  it("boots with a config and empty queue", async () => {
    const core = await boot();
    expect(core.config.downloadDir).toBeTruthy();
    expect(core.queue.getItems()).toEqual([]);
  });

  it("setThrottle parses raw input and reports the TUI notice", async () => {
    const core = await boot();
    const r = core.setThrottle("download", "500");
    expect(r.ok).toBe(true);
    expect(r.notice).toBe("Throttle: ↓ 500 KB/s");
    expect(core.config.maxDownloadKbps).toBe(500);
    // unchanged value -> unchanged notice
    expect(core.setThrottle("download", "500").notice).toBe("↓ throttle unchanged.");
    // blank means no cap
    expect(core.setThrottle("download", "").notice).toBe("Throttle: ↓ unlimited");
    expect(core.config.maxDownloadKbps).toBe(0);
  });

  it("setTrackers detects no-op and reports counts", async () => {
    const core = await boot();
    expect(core.setTrackers([]).notice).toBe("Trackers unchanged.");
    expect(core.setTrackers(["udp://a:1"]).notice).toBe("Saved 1 tracker.");
    expect(core.setTrackers([]).notice).toBe("Cleared extra trackers.");
  });

  it("useFolder normalizes, creates and activates; removeFolder refuses the active dir", async () => {
    const core = await boot();
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = path.join(os.tmpdir(), "torlink-test-state", "dl-a");
    const r = await core.useFolder(dir);
    expect(r.ok).toBe(true);
    expect(core.config.downloadDir).toBe(dir);
    expect(core.config.downloadDirs).toContain(dir);
    expect(core.removeFolder(dir).notice).toBe("Can't remove the active folder.");
  });

  it("emits update when config changes", async () => {
    const core = await boot();
    let hits = 0;
    core.on("update", () => hits++);
    core.setThrottle("upload", "100");
    expect(hits).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/core.test.ts`
Expected: FAIL — `Cannot find module './core'`

- [ ] **Step 3: Write the implementation**

Port each callback from `src/ui/App.tsx` lines 97–320 (boot effect, `setConfig`, `setTrackers`, `submitThrottle`, `setDownloadDir`/`addFolder` merged as `useFolder`, `removeFolder`, `startDownload`) with `setNotice(x)` replaced by returning `{ ok, notice: x }`:

```ts
// src/server/core.ts
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import {
  loadConfig,
  saveConfig,
  normalizeDirList,
  type Config,
} from "../config/config";
import { normalizeDownloadDir } from "../config/folder";
import { DownloadQueue, type AddInput } from "../download/queue";
import { loadQueue, loadSeeds } from "../download/persist";
import { loadHistory } from "../download/history";
import { reconcileQueue } from "../download/reconcile";
import { cleanText, truncate } from "../util/format";

export interface ActionResult {
  ok: boolean;
  notice: string;
}

export class Core extends EventEmitter {
  private constructor(
    public config: Config,
    public queue: DownloadQueue,
  ) {
    super();
    queue.on("update", () => this.emit("update"));
    queue.on("completed", (name: string) => this.emit("completed", name));
  }

  static async boot(): Promise<Core> {
    const cfg = await loadConfig();
    const q = new DownloadQueue();
    q.setTrackers(cfg.trackers);
    q.restore(reconcileQueue(await loadQueue()));
    q.restoreHistory(await loadHistory());
    q.restoreSeeds(await loadSeeds());
    q.setThrottle(cfg.maxDownloadKbps, cfg.maxUploadKbps);
    return new Core(cfg, q);
  }

  private setConfig(next: Config): void {
    this.config = next;
    this.queue.setTrackers(next.trackers);
    void saveConfig(next);
    this.emit("update");
  }

  async startDownload(input: AddInput): Promise<ActionResult> {
    await fs.mkdir(this.config.downloadDir, { recursive: true }).catch(() => {});
    this.queue.add(input, this.config.downloadDir);
    return { ok: true, notice: `Added: ${truncate(cleanText(input.name), 40)}` };
  }

  setTrackers(list: string[]): ActionResult {
    const cur = this.config.trackers;
    const same = list.length === cur.length && list.every((t, i) => t === cur[i]);
    if (same) return { ok: true, notice: "Trackers unchanged." };
    this.setConfig({ ...this.config, trackers: list });
    return {
      ok: true,
      notice:
        list.length === 0
          ? "Cleared extra trackers."
          : `Saved ${list.length} tracker${list.length === 1 ? "" : "s"}.`,
    };
  }

  setThrottle(direction: "download" | "upload", raw: string): ActionResult {
    const n = Number.parseInt(raw.trim(), 10);
    const kbps = Number.isFinite(n) && n > 0 ? n : 0;
    const key = direction === "download" ? "maxDownloadKbps" : "maxUploadKbps";
    const arrow = direction === "download" ? "↓" : "↑";
    if (kbps === this.config[key]) {
      return { ok: true, notice: `${arrow} throttle unchanged.` };
    }
    const next = { ...this.config, [key]: kbps };
    this.setConfig(next);
    this.queue.setThrottle(next.maxDownloadKbps, next.maxUploadKbps);
    const label = kbps > 0 ? `${kbps} KB/s` : "unlimited";
    return { ok: true, notice: `Throttle: ${arrow} ${label}` };
  }

  async useFolder(raw: string): Promise<ActionResult> {
    const dir = normalizeDownloadDir(raw);
    if (!dir) return { ok: false, notice: "Couldn't use folder." };
    if (dir === this.config.downloadDir) {
      return { ok: true, notice: "Download folder unchanged." };
    }
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      return { ok: false, notice: `Couldn't use folder: ${truncate(dir, 48)}` };
    }
    this.setConfig({
      ...this.config,
      downloadDir: dir,
      downloadDirs: normalizeDirList(dir, this.config.downloadDirs),
    });
    return { ok: true, notice: `Download folder: ${truncate(dir, 48)}` };
  }

  removeFolder(dir: string): ActionResult {
    if (dir === this.config.downloadDir) {
      return { ok: false, notice: "Can't remove the active folder." };
    }
    const downloadDirs = this.config.downloadDirs.filter((d) => d !== dir);
    this.setConfig({ ...this.config, downloadDirs });
    return { ok: true, notice: `Removed: ${truncate(dir, 48)}` };
  }

  suspend(): void {
    this.queue.suspend();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/core.test.ts`
Expected: PASS (all 5)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/server/core.ts src/server/core.test.ts
git commit -m "feat(server): extract UI-free Core with boot wiring and actions"
```

---

### Task 3: HTTP server skeleton — token gate, JSON actions, static files

**Files:**
- Create: `src/server/http.ts`, `src/server/sse.ts`
- Test: `src/server/http.test.ts`

**Interfaces:**
- Consumes: `Core`, `ActionResult` (Task 2), `snapshot`/`AppState` (Task 1).
- Produces:

```ts
export function createToken(): string;                    // 48-hex-char random token
export interface TorlinkServerOptions {
  core: Core;
  token: string;
  webRoot: string;        // absolute dir containing the built SPA (may not exist in dev)
  onQuit: () => void;     // called by POST /api/quit after the response is sent
}
export function createTorlinkServer(opts: TorlinkServerOptions): http.Server;
// src/server/sse.ts
export function startSse(res: http.ServerResponse): void;                      // writes SSE headers
export function sendSse(res: http.ServerResponse, event: string, data: unknown): void;
```

Routes implemented in this task (the rest come in Tasks 4–6):
- Token gate: every `/api/*` request must carry the token as `?token=` query param or `x-torlink-token` header; otherwise `401 {"error":"unauthorized"}`.
- `POST /api/downloads` `{id, name, magnet, source?, sizeBytes?}` → `core.startDownload`, 200 `{ok, notice}`. Missing/empty `magnet` or `id` or `name` → `400 {"error":"invalid input"}`.
- `POST /api/quit` → 200 `{ok: true}`, then `onQuit()`.
- Unknown `/api/*` → `404 {"error":"not found"}`.
- `GET /` → `<webRoot>/index.html`; `GET /assets/*` → files under webRoot (content types: `.html`, `.js`, `.css`, `.svg`, `.woff2`; anything else `application/octet-stream`). Path-traversal guard: resolved path must stay inside webRoot, else 404. Missing webRoot → 503 with a plain-text hint to run the Vite build.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/http.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
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
}
const ctxs: Ctx[] = [];

async function start(): Promise<Ctx> {
  const core = await Core.boot();
  const token = createToken();
  const webRoot = mkdtempSync(join(tmpdir(), "torlink-web-"));
  writeFileSync(join(webRoot, "index.html"), "<p>torlink</p>");
  const ctx: Partial<Ctx> = { token, core, quits: 0 };
  const server = createTorlinkServer({
    core,
    token,
    webRoot,
    onQuit: () => { ctx.quits = (ctx.quits ?? 0) + 1; },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  ctx.base = `http://127.0.0.1:${addr.port}`;
  ctx.server = server;
  ctxs.push(ctx as Ctx);
  return ctx as Ctx;
}

afterEach(async () => {
  for (const c of ctxs.splice(0)) {
    await new Promise((r) => c.server.close(r));
    c.core.suspend();
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
    const q = await fetch(`${base}/api/nope?token=${token}`);
    expect(q.status).toBe(404);
    const h = await fetch(`${base}/api/nope`, { headers: { "x-torlink-token": token } });
    expect(h.status).toBe(404);
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

  it("validates download input", async () => {
    const { base, token } = await start();
    const res = await fetch(`${base}/api/downloads?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("quit responds then fires onQuit", async () => {
    const ctx = await start();
    const res = await fetch(`${ctx.base}/api/quit?token=${ctx.token}`, { method: "POST" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.quits).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/http.test.ts`
Expected: FAIL — `Cannot find module './http'`

- [ ] **Step 3: Write the implementation**

```ts
// src/server/sse.ts
import type { ServerResponse } from "node:http";

export function startSse(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(":ok\n\n");
}

export function sendSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
```

```ts
// src/server/http.ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { Core } from "./core";

export function createToken(): string {
  return randomBytes(24).toString("hex");
}

export interface TorlinkServerOptions {
  core: Core;
  token: string;
  webRoot: string;
  onQuit: () => void;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serveStatic(res: ServerResponse, webRoot: string, pathname: string): void {
  if (!existsSync(webRoot)) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("torlink web assets missing — run `npm run build` (or use the Vite dev server)");
    return;
  }
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = resolve(join(webRoot, rel));
  if (!file.startsWith(resolve(webRoot) + sep) && file !== resolve(join(webRoot, "index.html"))) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

export function createTorlinkServer(opts: TorlinkServerOptions): Server {
  const { core, token, webRoot, onQuit } = opts;

  return createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const { pathname } = url;

    if (!pathname.startsWith("/api/")) {
      if (req.method !== "GET") return sendJson(res, 404, { error: "not found" });
      return serveStatic(res, webRoot, pathname);
    }

    const given = url.searchParams.get("token") ?? req.headers["x-torlink-token"];
    if (given !== token) return sendJson(res, 401, { error: "unauthorized" });

    const route = `${req.method} ${pathname}`;

    if (route === "POST /api/downloads") {
      const body = (await readJson(req)) as {
        id?: string; name?: string; magnet?: string; source?: string; sizeBytes?: number;
      } | null;
      if (!body?.id || !body.name || !body.magnet) {
        return sendJson(res, 400, { error: "invalid input" });
      }
      const r = await core.startDownload({
        id: body.id,
        name: body.name,
        magnet: body.magnet,
        source: body.source as never,
        sizeBytes: body.sizeBytes,
      });
      return sendJson(res, r.ok ? 200 : 400, r);
    }

    if (route === "POST /api/quit") {
      sendJson(res, 200, { ok: true });
      setTimeout(onQuit, 10);
      return;
    }

    return sendJson(res, 404, { error: "not found" });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/http.test.ts`
Expected: PASS (all 6)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/server/http.ts src/server/sse.ts src/server/http.test.ts
git commit -m "feat(server): http server with token gate, static serving, downloads and quit routes"
```

---

### Task 4: SSE state stream `/api/events`

**Files:**
- Modify: `src/server/http.ts` (add route)
- Test: `src/server/http.test.ts` (append)

**Interfaces:**
- Consumes: `snapshot` (Task 1), `startSse/sendSse` (Task 3), `Core` events `update` / `completed`.
- Produces: SSE events named `state` (payload `AppState`) and `completed` (payload `{name: string}`). Web hook in Task 10 parses exactly these.

Behavior: on connect, push one `state` immediately. Then push `state` on every core `update`, trailing-throttled to at most one per 500 ms (mirrors the TUI's 200–500 ms cadence). `completed` events forward immediately. Clean up listeners on request close.

- [ ] **Step 1: Write the failing test** (append to `src/server/http.test.ts`)

```ts
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
  let acted = false;
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
    if (act && !acted) { acted = true; act(); }
  }
  await reader.cancel();
  return out;
}

describe("GET /api/events", () => {
  it("sends an initial state snapshot and pushes on updates", async () => {
    const { base, token, core } = await start();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/http.test.ts`
Expected: the new test FAILS (route 404s / times out at 2 events); earlier tests still pass. Use `--testTimeout=10000` if the default trips.

- [ ] **Step 3: Implement the route** (inside `handle` in `src/server/http.ts`, before the 404 fallthrough)

```ts
if (route === "GET /api/events") {
  startSse(res);
  sendSse(res, "state", snapshot(core.queue, core.config));
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onUpdate = (): void => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      sendSse(res, "state", snapshot(core.queue, core.config));
    }, 500);
  };
  const onCompleted = (name: string): void => sendSse(res, "completed", { name });
  core.on("update", onUpdate);
  core.on("completed", onCompleted);
  req.on("close", () => {
    core.off("update", onUpdate);
    core.off("completed", onCompleted);
    if (timer) clearTimeout(timer);
  });
  return;
}
```

Add the imports: `import { snapshot } from "./state";` and `import { startSse, sendSse } from "./sse";`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/http.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/server/http.ts src/server/http.test.ts
git commit -m "feat(server): SSE state stream with throttled snapshots and completed events"
```

---

### Task 5: Search SSE `/api/search`

**Files:**
- Create: `src/server/search.ts`
- Modify: `src/server/http.ts` (add route)
- Test: `src/server/search.test.ts`

**Interfaces:**
- Consumes: `Source`, `TorrentResult` (`src/sources/types.ts`), `cachedSearch` (`src/sources/cache.ts`), `HttpError` (`src/util/net.ts`), `startSse/sendSse`.
- Produces: `runSearchSse(res, query, opts?: { sources?: readonly Source[]; timeoutMs?: number; signal?: AbortSignal })` emitting SSE events:
  - `source` — `{ sourceId, items: TorrentResult[] }` on success, `{ sourceId, error: string, code: string }` on failure
  - `done` — `{}` after every source settled; then `res.end()`.

The per-source loop is a straight port of `src/ui/hooks/useConcurrentSearch.ts` lines 64–117 (per-source AbortController, 25 s timeout, `errorCode` mapping) with `setState` replaced by `sendSse`. Dedupe/ordering stay client-side. `errorCode` moves here (exported) so the web hook can reuse the shape.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/search.test.ts
import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
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

function parse(chunks: string[]): { event: string; data: any }[] {
  return chunks
    .join("")
    .split("\n\n")
    .filter((b) => b.includes("event:"))
    .map((b) => ({
      event: /event: (.*)/.exec(b)![1]!,
      data: JSON.parse(/data: (.*)/.exec(b)![1]!),
    }));
}

describe("runSearchSse", () => {
  it("emits one source event per source then done", async () => {
    const good: Source = {
      id: "yts", label: "YTS", group: "Movies", homepage: "x",
      search: async () => [result("aa")],
    };
    const bad: Source = {
      id: "solid", label: "Solid", group: "Movies", homepage: "x",
      search: async () => { throw new Error("boom"); },
    };
    const { res, chunks, ended } = fakeRes();
    await runSearchSse(res, "ubuntu", { sources: [good, bad] });
    const events = parse(chunks);
    expect(events).toHaveLength(3);
    const bySource = events.filter((e) => e.event === "source");
    expect(bySource.find((e) => e.data.sourceId === "yts")!.data.items).toHaveLength(1);
    const failed = bySource.find((e) => e.data.sourceId === "solid")!.data;
    expect(failed.error).toBe("boom");
    expect(failed.code).toBe("no response");
    expect(events.at(-1)!.event).toBe("done");
    expect(ended()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/search.test.ts`
Expected: FAIL — `Cannot find module './search'`

- [ ] **Step 3: Write the implementation**

```ts
// src/server/search.ts
import type { ServerResponse } from "node:http";
import { SOURCES } from "../sources/registry";
import { cachedSearch } from "../sources/cache";
import { HttpError } from "../util/net";
import type { Source } from "../sources/types";
import { startSse, sendSse } from "./sse";

const PER_SOURCE_TIMEOUT_MS = 25000;

export function errorCode(e: unknown, timedOut: boolean): string {
  if (timedOut) return "timed out";
  if (e instanceof HttpError && e.status > 0) return `HTTP ${e.status}`;
  return "no response";
}

export interface SearchSseOptions {
  sources?: readonly Source[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function runSearchSse(
  res: ServerResponse,
  query: string,
  opts: SearchSseOptions = {},
): Promise<void> {
  const sources = opts.sources ?? SOURCES;
  const timeoutMs = opts.timeoutMs ?? PER_SOURCE_TIMEOUT_MS;
  startSse(res);

  await Promise.all(
    sources.map(async (source) => {
      const sc = new AbortController();
      const onAbort = (): void => sc.abort();
      opts.signal?.addEventListener("abort", onAbort);
      const timer = setTimeout(() => sc.abort(), timeoutMs);
      try {
        const items = await cachedSearch(source, query, { signal: sc.signal });
        if (!opts.signal?.aborted) sendSse(res, "source", { sourceId: source.id, items });
      } catch (e: unknown) {
        if (opts.signal?.aborted) return;
        const timedOut = sc.signal.aborted;
        sendSse(res, "source", {
          sourceId: source.id,
          error: timedOut ? "timed out" : e instanceof Error ? e.message : String(e),
          code: errorCode(e, timedOut),
        });
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
      }
    }),
  );
  if (!opts.signal?.aborted) sendSse(res, "done", {});
  res.end();
}
```

Route in `src/server/http.ts` (before the 404 fallthrough):

```ts
if (route === "GET /api/search") {
  const q = url.searchParams.get("q") ?? "";
  const ctrl = new AbortController();
  req.on("close", () => ctrl.abort());
  void runSearchSse(res, q, { signal: ctrl.signal });
  return;
}
```

with `import { runSearchSse } from "./search";`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/search.test.ts src/server/http.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/server/search.ts src/server/search.test.ts src/server/http.ts
git commit -m "feat(server): per-source search SSE endpoint"
```

---

### Task 6: Remaining action routes

**Files:**
- Modify: `src/server/http.ts`
- Test: `src/server/http.test.ts` (append)

**Interfaces:** consumes `Core` methods (Task 2) and `DownloadQueue` methods (`togglePause` is NOT used — the routes are explicit): `pause`, `resume`, `cancel`, `retry`, `removeHistory`, `clearHistory`, `startSeeding`, `stopSeeding`, `getHistory`, `getSeed`.

Routes (all return `{ok: true}` or `{ok, notice}`; unknown ids are no-ops returning `{ok: true}`, matching the queue's tolerant methods):

| Route | Implementation |
|---|---|
| `POST /api/downloads/:id/pause` | `core.queue.pause(id)` |
| `POST /api/downloads/:id/resume` | `core.queue.resume(id)` |
| `POST /api/downloads/:id/cancel` | `core.queue.cancel(id)` |
| `POST /api/downloads/:id/retry` | `core.queue.retry(id)` |
| `POST /api/history/:id/delete` | `core.queue.removeHistory(id)` |
| `POST /api/history/clear` | `core.queue.clearHistory()` |
| `POST /api/seeds/:id/resume` | look up `core.queue.getHistory()` entry by id; 404 `{error:"unknown id"}` if absent; else `core.queue.startSeeding(h)` |
| `POST /api/seeds/:id/pause` | `core.queue.stopSeeding(id)` |
| `POST /api/seeds/:id/remove` | `core.queue.removeHistory(id)` (what the TUI's `c` on a seed does — it removes the history entry which tears down the seed) |
| `POST /api/config/throttle` `{direction, value}` | `core.setThrottle(direction, value)` — validate `direction` is `"download"`\|`"upload"`, else 400 |
| `POST /api/config/trackers` `{urls: string[]}` | validate array of strings else 400; `core.setTrackers(urls)` |
| `POST /api/config/folder` `{action: "use"\|"remove", dir}` | `use` → `core.useFolder(dir)`; `remove` → `core.removeFolder(dir)`; anything else 400 |

Parse `:id` with a regex per group, e.g. `/^\/api\/downloads\/([^/]+)\/(pause|resume|cancel|retry)$/`. Decode with `decodeURIComponent`.

- [ ] **Step 1: Write failing tests** (append to `src/server/http.test.ts`; follow the existing `start()` pattern)

```ts
describe("action routes", () => {
  it("download lifecycle routes are tolerant of unknown ids", async () => {
    const { base, token } = await start();
    for (const action of ["pause", "resume", "cancel", "retry"]) {
      const res = await fetch(`${base}/api/downloads/nope/${action}?token=${token}`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
    }
  });

  it("throttle route validates direction and applies", async () => {
    const { base, token, core } = await start();
    const bad = await fetch(`${base}/api/config/throttle?token=${token}`, {
      method: "POST",
      body: JSON.stringify({ direction: "sideways", value: "5" }),
    });
    expect(bad.status).toBe(400);
    const ok = await fetch(`${base}/api/config/throttle?token=${token}`, {
      method: "POST",
      body: JSON.stringify({ direction: "download", value: "250" }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).notice).toBe("Throttle: ↓ 250 KB/s");
    expect(core.config.maxDownloadKbps).toBe(250);
  });

  it("trackers and folder routes round-trip through Core", async () => {
    const { base, token, core } = await start();
    const t = await fetch(`${base}/api/config/trackers?token=${token}`, {
      method: "POST",
      body: JSON.stringify({ urls: ["udp://x:1"] }),
    });
    expect((await t.json()).notice).toBe("Saved 1 tracker.");
    const f = await fetch(`${base}/api/config/folder?token=${token}`, {
      method: "POST",
      body: JSON.stringify({ action: "remove", dir: core.config.downloadDir }),
    });
    expect((await f.json()).notice).toBe("Can't remove the active folder.");
  });

  it("seed resume 404s for an id with no history", async () => {
    const { base, token } = await start();
    const res = await fetch(`${base}/api/seeds/nope/resume?token=${token}`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/server/http.test.ts`
Expected: new tests FAIL with 404s where 200/400 expected.

- [ ] **Step 3: Implement the routes** in `handle`, following the table above. Shape:

```ts
const dl = /^\/api\/downloads\/([^/]+)\/(pause|resume|cancel|retry)$/.exec(pathname);
if (req.method === "POST" && dl) {
  const id = decodeURIComponent(dl[1]!);
  const fn = { pause: "pause", resume: "resume", cancel: "cancel", retry: "retry" } as const;
  core.queue[fn[dl[2] as keyof typeof fn]](id);
  return sendJson(res, 200, { ok: true });
}
```

…and analogous blocks for history, seeds (with the history lookup for `resume`), and the three config routes calling Core with validation as specified.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (all files)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/server/http.ts src/server/http.test.ts
git commit -m "feat(server): download, history, seed and config action routes"
```

---

### Task 7: CLI entry `src/index.ts` + browser opener

**Files:**
- Create: `src/index.ts`, `src/server/open.ts`
- Delete: nothing yet (`src/index.tsx` still exists until Task 17; tsup entry still points at it)

**Interfaces:**
- Consumes: `parseCliArgs/HELP_TEXT` (`src/cli/args.ts`), `VERSION` (`src/version.ts`), `Core`, `createToken/createTorlinkServer`, `parseMagnet` (`src/sources/magnet.ts`), `magnetFromTorrentFile` (`src/sources/torrentFile.ts`).
- Produces: the process entrypoint. `openBrowser(url: string): void` — `open` on darwin, `start` via `cmd /c` on win32, `xdg-open` elsewhere, spawned detached, errors swallowed (URL is printed regardless).

```ts
// src/server/open.ts
import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    // URL is printed; a failed auto-open is not fatal.
  }
}
```

```ts
// src/index.ts
import { parseCliArgs, HELP_TEXT } from "./cli/args";
import { VERSION } from "./version";
import { Core } from "./server/core";
import { createToken, createTorlinkServer } from "./server/http";
import { openBrowser } from "./server/open";
import { parseMagnet } from "./sources/magnet";
import { magnetFromTorrentFile } from "./sources/torrentFile";
import { fileURLToPath } from "node:url";

const cmd = parseCliArgs(process.argv.slice(2));

if (cmd.kind === "help") {
  console.log(HELP_TEXT);
  process.exit(0);
}
if (cmd.kind === "version") {
  console.log(`torlink v${VERSION}`);
  process.exit(0);
}
if (cmd.kind === "invalid") {
  console.error(`error: unknown argument '${cmd.arg}'\n`);
  console.error(HELP_TEXT);
  process.exit(1);
}

const core = await Core.boot();

const launch = cmd.initialMagnet
  ? parseMagnet(cmd.initialMagnet)
  : cmd.initialTorrent
    ? await magnetFromTorrentFile(cmd.initialTorrent)
    : null;
if (launch) {
  await core.startDownload({ id: launch.infoHash, name: launch.name, magnet: launch.magnet });
}

const token = process.env.TORLINK_TOKEN ?? createToken();
const webRoot = fileURLToPath(new URL("./web/", import.meta.url));

let quitting = false;
function quit(code = 0): void {
  if (quitting) process.exit(code);
  quitting = true;
  core.suspend(); // persistSync + engine teardown, same guarantees as the TUI's forceExit
  server.close();
  process.exit(code);
}

const server = createTorlinkServer({ core, token, webRoot, onQuit: () => quit(0) });
const port = Number(process.env.TORLINK_PORT) || 0;
server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const actual = addr && typeof addr !== "string" ? addr.port : port;
  const url = `http://127.0.0.1:${actual}/?token=${token}`;
  console.log(`torlink v${VERSION}\n\n  ${url}\n\nCtrl+C to quit.`);
  if (!process.env.TORLINK_NO_OPEN) openBrowser(url);
});

process.on("SIGINT", () => quit(0));
process.on("SIGTERM", () => quit(0));
process.on("uncaughtException", (err) => {
  console.error(err);
  quit(1);
});
```

Also update `src/cli/args.ts` `HELP_TEXT` copy: replace `open the search TUI` with `start torlink and open it in your browser`, and the `once open:` paragraph's first line with `once open: type to search every source at once, enter to run, arrows to move,` (unchanged) — only the first usage line changes. Update the matching assertion in `src/cli/args.test.ts` if one exists (check with `grep -n "TUI" src/cli/args.test.ts`).

- [ ] **Step 1: Write the files above**
- [ ] **Step 2: Typecheck** — `npm run typecheck` — expected PASS (note `src/index.tsx` also still typechecks; both entries coexist until Task 17).
- [ ] **Step 3: Manual smoke test**

Run: `TORLINK_NO_OPEN=1 npx tsx src/index.ts`
Expected: prints a `http://127.0.0.1:<port>/?token=<hex>` URL; `curl` of `/api/events?token=...` streams a `state` event; Ctrl+C exits cleanly and promptly.

- [ ] **Step 4: Run full test suite** — `npm test` — expected PASS.
- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/server/open.ts src/cli/args.ts src/cli/args.test.ts
git commit -m "feat: web-server CLI entrypoint with browser auto-open"
```

---

### Task 8: Vite scaffold + build wiring

**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/theme.css`
- Modify: `package.json`, `tsup.config.ts`, `tsconfig.json` (add `"jsx": "react-jsx"` DOM lib if missing — check first; the Ink app already uses react-jsx so likely only `"lib"` needs `"DOM"`)

**Interfaces:**
- Produces: `npm run dev:server` (API server on port 9877, token `dev`, no auto-open), `npm run dev` (Vite on 5173 proxying `/api`), `npm run build` (tsup + vite → `dist/cli.cjs`, `dist/index.js`, `dist/web/`).

- [ ] **Step 1: Install dev dependencies**

```bash
npm i -D vite @vitejs/plugin-react react-dom @types/react-dom jsdom @testing-library/react
```

- [ ] **Step 2: Write configs**

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:9877" },
  },
});
```

`tsup.config.ts`: change `entry: ["src/index.tsx"]` → `entry: ["src/index.ts"]` and drop the `esbuildOptions` jsx block (server code has no JSX).

`package.json` scripts:

```json
"dev": "vite",
"dev:server": "TORLINK_PORT=9877 TORLINK_TOKEN=dev TORLINK_NO_OPEN=1 tsx src/index.ts",
"build": "tsup && vite build",
"postbuild": "node scripts/postbuild.cjs",
```

(`postbuild` runs automatically after `build` via npm lifecycle — verify order: tsup's `clean: true` wipes `dist/`, then vite writes `dist/web`, then postbuild copies `cli.cjs`. Since `vite build` runs after `tsup`, the wipe cannot eat `dist/web`.)

```html
<!-- src/web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>torlink</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/web/main.tsx
import { createRoot } from "react-dom/client";
import "./theme.css";

function Placeholder() {
  return <p>torlink</p>;
}

createRoot(document.getElementById("root")!).render(<Placeholder />);
```

```css
/* src/web/theme.css — palette lifted verbatim from src/ui/theme.ts */
:root {
  --accent: #a78bfa;
  --text: #e9e4f5;
  --alt: #b9a7e6;
  --good: #86d6a2;
  --warn: #f0c560;
  --bad: #ee7d92;
  --bright: #d8b4fe;
  --rule: #6b6577;
  --bg: #16121f;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font: 14px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `dist/index.js`, `dist/cli.cjs`, `dist/web/index.html`, `dist/web/assets/*.js` all exist. Then `TORLINK_NO_OPEN=1 node dist/index.js` serves the placeholder page at the printed URL.

- [ ] **Step 4: Verify dev flow**

Run `npm run dev:server` in one shell, `npm run dev` in another; open `http://localhost:5173/?token=dev` — placeholder renders, `curl 'http://localhost:5173/api/events?token=dev'` streams through the proxy.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts src/web tsup.config.ts package.json package-lock.json tsconfig.json
git commit -m "build: vite SPA scaffold wired into tsup build and dev flow"
```

---

### Task 9: Web API client + hooks

**Files:**
- Create: `src/web/api.ts`, `src/web/hooks/useServerState.ts`, `src/web/hooks/useConcurrentSearch.ts`
- Test: `src/web/api.test.ts` (vitest, node env — token/url logic is pure)

**Interfaces:**
- Consumes: `AppState` (Task 1, type-only import from `../server/state`), `SourceState`/dedupe/order logic from `src/ui/hooks/useConcurrentSearch.ts` (copied verbatim), `TorrentResult`.
- Produces:

```ts
// api.ts
export function getToken(): string;                          // query param, cached in sessionStorage under "torlink-token"
export function apiUrl(path: string): string;                // appends ?token=
export interface ActionResponse { ok: boolean; notice?: string; error?: string }
export function post(path: string, body?: unknown): Promise<ActionResponse>;
// useServerState.ts
export function useServerState(): { state: AppState | null; completed: string | null };
// hooks/useConcurrentSearch.ts — same signature as the TUI hook:
export function useConcurrentSearch(query: string): ConcurrentSearchState;
```

- [ ] **Step 1: Write failing test for the token/url logic**

```ts
// src/web/api.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getToken, apiUrl } from "./api";

describe("api token plumbing", () => {
  it("reads the token from the query string and caches it", () => {
    window.history.replaceState(null, "", "/?token=abc123");
    sessionStorage.clear();
    expect(getToken()).toBe("abc123");
    window.history.replaceState(null, "", "/");
    expect(getToken()).toBe("abc123"); // from sessionStorage now
    expect(apiUrl("/api/quit")).toBe("/api/quit?token=abc123");
    expect(apiUrl("/api/search?q=x")).toBe("/api/search?q=x&token=abc123");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/web/api.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/web/api.ts
const KEY = "torlink-token";

export function getToken(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) {
    sessionStorage.setItem(KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(KEY) ?? "";
}

export function apiUrl(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(getToken())}`;
}

export interface ActionResponse {
  ok: boolean;
  notice?: string;
  error?: string;
}

export async function post(path: string, body?: unknown): Promise<ActionResponse> {
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ActionResponse;
    return { ok: res.ok && data.ok !== false, notice: data.notice, error: data.error };
  } catch {
    return { ok: false, error: "torlink server unreachable" };
  }
}
```

```ts
// src/web/hooks/useServerState.ts
import { useEffect, useState } from "react";
import type { AppState } from "../../server/state";
import { apiUrl } from "../api";

export function useServerState(): { state: AppState | null; completed: string | null } {
  const [state, setState] = useState<AppState | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(apiUrl("/api/events"));
    es.addEventListener("state", (e) => {
      setState(JSON.parse((e as MessageEvent).data) as AppState);
    });
    es.addEventListener("completed", (e) => {
      setCompleted((JSON.parse((e as MessageEvent).data) as { name: string }).name);
    });
    return () => es.close();
  }, []);

  return { state, completed };
}
```

`src/web/hooks/useConcurrentSearch.ts`: copy `src/ui/hooks/useConcurrentSearch.ts` and replace the per-source `cachedSearch` loop (lines 67–122) with one `EventSource(apiUrl("/api/search?q=" + encodeURIComponent(query)))`: on each `source` event merge `items` into `collected` / set `perSource[sourceId]` from `{error, code}`; on `done` (or `es.onerror` after done) close and set `loading: false`. Keep `SourceState`, `dedupe`, `defaultOrder`, `blankPerSource`, `idleState` **verbatim**. `done`/`total` become counts of settled source events.

- [ ] **Step 4: Run tests** — `npx vitest run src/web/api.test.ts` — PASS. `npm run typecheck` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/web/api.ts src/web/api.test.ts src/web/hooks
git commit -m "feat(web): api client, SSE state hook and SSE-backed search hook"
```

---

### Task 10: Web store, keyboard dispatcher, App shell

**Files:**
- Create: `src/web/store.ts`, `src/web/keyboard.ts`, `src/web/App.tsx`
- Modify: `src/web/main.tsx` (mount App)
- Test: `src/web/keyboard.test.ts`

**Interfaces:**
- Consumes: `useServerState`, `post`, `parseMagnet` (`../sources/magnet`), types from `src/ui/store.ts` (`View/Category/Section/Region/CaptureMode/DownloadFocus/SeedFocus/CATEGORIES` — copy these type/const declarations into `src/web/store.ts` verbatim; they move here permanently, Task 17 deletes the originals).
- Produces:

```ts
// src/web/store.ts — the web Store: src/ui/store.ts's Store minus
// `queue`, `listRows`, `compact`, `contentWidth`, `cols`, `rows`, plus `state`.
export interface Store {
  config: Config;
  state: AppState;                       // components read state.queue/state.seeds/state.history
  view: View; setView(v: View): void;
  query: string; submitQuery(q: string): void;
  section: Section; setSection(s: Section): void;
  region: Region; setRegion(r: Region): void;
  captureMode: CaptureMode; setCaptureMode(m: CaptureMode): void;
  downloadFocus: DownloadFocus | null; setDownloadFocus(f: DownloadFocus | null): void;
  seedFocus: SeedFocus | null; setSeedFocus(f: SeedFocus | null): void;
  startDownload(input: { id: string; name: string; magnet: string; source?: SourceId; sizeBytes?: number }): void;
  copyMagnet(input: { name: string; magnet: string }): void;
  showError(item: QueueItem): void;
  notice: string | null; setNotice(s: string | null): void;
  quitAll(): void;
}
export const StoreContext: React.Context<Store | null>;
export function useStore(): Store;
// src/web/keyboard.ts
export interface KeyDeps { /* the store fields + overlay setters App.tsx's useInput reads */ }
export function handleGlobalKey(e: KeyboardEvent, deps: KeyDeps): void;
```

**App.tsx** is a port of `src/ui/App.tsx` with these systematic changes:
- Boot effect (lines 97–134) deleted — `useServerState()` supplies config/queue/seeds/history; splash shows while `state === null`.
- All action callbacks become `post(...)` calls whose `notice`/`error` response feeds `setNotice` (copy strings arrive from the server): `startDownload` → `post("/api/downloads", input)`; the folder/tracker/throttle prompt submit handlers → the matching `/api/config/*` routes; `quitAll` → `post("/api/quit")` then render a full-screen "torlink stopped — you can close this tab." message.
- `copyMagnet` uses `navigator.clipboard.writeText`; `pasteFromClipboard` (`m`) uses `navigator.clipboard.readText()` — same regex + `parseMagnet` + notices as App.tsx lines 345–359.
- The `completed` value from `useServerState` drives the same notice as App.tsx lines 136–144 (`✓ <name truncated to 40>`); notices still auto-clear after 4 s.
- Terminal-size math (lines 55–77, 367–378) deleted; layout is CSS (`App` renders the same tree: logo row + rule, overlay slot, sidebar + content flex row, footer).
- `useInput` (lines 444–515) becomes a `useEffect` installing `window.addEventListener("keydown", ...)` that calls `handleGlobalKey`.

**keyboard.ts** ports the `useInput` body. Key mapping: `key.tab`→`e.key === "Tab"`, arrows → `"ArrowLeft"` etc., `key.escape`→`"Escape"`, `key.ctrl && input === "c"` is NOT ported (the browser owns Ctrl+C; quitting is `q` or the terminal). Extra web rule at the top: if `e.target` is an `input`/`textarea` or `e.isComposing`, return (this is what `captureMode === "text"` guarded in the TUI, and the TUI's `captureMode` state is still kept for the prompts' esc handling). Call `e.preventDefault()` for handled keys (`Tab` especially).

- [ ] **Step 1: Write failing keyboard tests**

```ts
// src/web/keyboard.test.ts
import { describe, expect, it, vi } from "vitest";
import { handleGlobalKey, type KeyDeps } from "./keyboard";

function deps(over: Partial<KeyDeps> = {}): KeyDeps {
  return {
    region: "content",
    setRegion: vi.fn(),
    setView: vi.fn(),
    captureMode: "none",
    editingPrompt: false,
    errorItem: null,
    clearErrorItem: vi.fn(),
    showHelp: false,
    setShowHelp: vi.fn(),
    openFolder: vi.fn(),
    openTrackers: vi.fn(),
    openThrottle: vi.fn(),
    pasteMagnet: vi.fn(),
    quitAll: vi.fn(),
    ...over,
  };
}

function key(k: string, target?: Partial<EventTarget & { tagName: string }>): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, cancelable: true });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("handleGlobalKey", () => {
  it("? opens help; any key closes it", () => {
    const d = deps();
    handleGlobalKey(key("?"), d);
    expect(d.setShowHelp).toHaveBeenCalledWith(true);
    const open = deps({ showHelp: true });
    handleGlobalKey(key("x"), open);
    expect(open.setShowHelp).toHaveBeenCalledWith(false);
  });

  it("tab toggles region and q quits", () => {
    const d = deps({ region: "sidebar" });
    handleGlobalKey(key("Tab"), d);
    expect(d.setRegion).toHaveBeenCalledWith("content");
    handleGlobalKey(key("q"), d);
    expect(d.quitAll).toHaveBeenCalled();
  });

  it("escape walks content -> sidebar -> splash", () => {
    const d = deps({ region: "content" });
    handleGlobalKey(key("Escape"), d);
    expect(d.setRegion).toHaveBeenCalledWith("sidebar");
    const side = deps({ region: "sidebar" });
    handleGlobalKey(key("Escape"), side);
    expect(side.setView).toHaveBeenCalledWith("splash");
  });

  it("ignores keys typed into an input", () => {
    const d = deps();
    handleGlobalKey(key("q", { tagName: "INPUT" }), d);
    expect(d.quitAll).not.toHaveBeenCalled();
  });

  it("prompt-open keys and paste dispatch", () => {
    const d = deps();
    handleGlobalKey(key("o"), d);
    expect(d.openFolder).toHaveBeenCalled();
    handleGlobalKey(key("t"), d);
    expect(d.openTrackers).toHaveBeenCalled();
    handleGlobalKey(key("r"), d);
    expect(d.openThrottle).toHaveBeenCalledWith("download");
    handleGlobalKey(key("u"), d);
    expect(d.openThrottle).toHaveBeenCalledWith("upload");
    handleGlobalKey(key("m"), d);
    expect(d.pasteMagnet).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/web/keyboard.test.ts` — FAIL.
- [ ] **Step 3: Implement `keyboard.ts`, `store.ts`, `App.tsx`, update `main.tsx`** per the interface block and porting notes above. `KeyDeps` is exactly the fields the test constructs. The dispatch order mirrors App.tsx lines 444–515: input guard → prompt-owns-input guard (`editingPrompt`) → errorItem dismiss → help dismiss → `?` → `o`/`t`/`r`/`u` → `m` → `Tab` → arrows/`h`/`l` region moves → `Escape` → `q`. (Region-internal navigation — `j`/`k`, enter on rows, `d`, `y`, `s`, `p`, `c`, `f`, `x` — stays inside the section components exactly as it does in the TUI, where Results/Downloads/Seeding have their own `useInput`; those become per-component keydown handling ported in Tasks 12–16, active when `region === "content"` — pass an `active` prop like the Ink components' `isActive`.)
- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/web/keyboard.test.ts && npm run typecheck` — PASS. `npm run dev` + `npm run dev:server`: App shell renders splash then the (still empty) browser layout against live state.
- [ ] **Step 5: Commit**

```bash
git add src/web/store.ts src/web/keyboard.ts src/web/keyboard.test.ts src/web/App.tsx src/web/main.tsx
git commit -m "feat(web): store context, global keyboard dispatcher and app shell"
```

---

### Tasks 11–16: Component ports

**Porting rules (apply to every component task below):**

1. Copy the Ink component from `src/ui/...`, keep its name, props, and logic. Translate rendering only:
   - `<Box flexDirection="column">` → `<div className="col">`; `<Box>` (row) → `<div className="row">`; add `.col { display:flex; flex-direction:column }` / `.row { display:flex }` once in `theme.css`.
   - `<Text color={COLOR.x}>` → `<span style={{ color: "var(--x)" }}>` or a class per palette color (`.c-accent`, `.c-good`, …) — add the classes once in `theme.css`.
   - `<Text dimColor>` → `.dim { opacity: .6 }`; `<Text bold>` → `.b { font-weight: 700 }`; `wrap="truncate"`/`truncate-middle` → `.trunc { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }` (middle-truncation approximated by end-truncation — acceptable rendering difference).
   - `width={n}` in character cells → `style={{ width: \`${n}ch\` }}`; `marginTop={1}` → `.mt` (one line-height margin); `paddingX={1}` → `.px`.
   - `useInput((input, key) => …, { isActive })` → the component receives `active: boolean` and registers a `window` keydown listener in a `useEffect` gated on `active` (same pattern as Task 10's dispatcher; component handlers run only when no overlay is open — the parent already encodes that in `active`, exactly like the TUI's `isActive`).
   - Selection movement keeps `move.ts`; after a selection change call `ref.scrollIntoView({ block: "nearest" })` on the selected row (replaces TUI windowing).
2. Mouse additions (the only intentional deltas): `onClick` on every selectable row selects it; double-click acts as enter; sidebar entries `onClick` open their section; footer hint chips are clickable buttons firing the same handler as the key.
3. Data access changes: `useQueueItems(queue)`/`useQueueHistory(queue)`/`useSeeds(queue)` → `useStore().state.queue` / `.history` / `new Map(state.seeds.map(s => [s.id, s]))`. Everything the TUI got from `store.queue.<method>` becomes the matching `post()` action (Task 6 table).
4. Notices: every action's `ActionResponse.notice ?? error` goes to `setNotice`.
5. No behavior additions. If the Ink component special-cases something (e.g. Results' per-source status line, Downloads' four focus groups), the port keeps it.

**Per-task breakdown — each task follows the same steps: port, smoke-render test, typecheck, visual check in dev, commit.**

The smoke-render test template (adjust name/assertion per component):

```tsx
// src/web/components/<Name>.test.tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
// wrap in StoreContext.Provider with a minimal fake Store where the component uses useStore()
```

- [ ] **Task 11: primitives** — `Panel`, `Rule`, `Footer`, `Spinner`, `ProgressBar`, `Logo`, `TabTitle` (becomes `useEffect(() => { document.title = "torlink" })` — plus the download-progress suffix logic if the Ink version renders one), sheen usage inside Logo (port `sheen.ts` as-is; it's pure string/color math driven by a timer — keep the interval, render per-char `<span>`s).
  Commit: `feat(web): port primitive components`
- [ ] **Task 12: Sidebar + SearchBar + Splash** — `RAIL_WIDTH` becomes a `ch`-width; SearchBar's `TextField` is replaced by a native `<input>` (controlled, `onKeyDown` for enter/escape, focus managed via `captureMode` — focusing the input sets `captureMode "text"`, blur resets, mirroring the TUI contract). `src/ui/components/TextField.tsx` is NOT ported.
  Commit: `feat(web): port sidebar, search bar and splash`
- [ ] **Task 13: Results** — port `src/ui/components/Results.tsx` whole: per-source status line, category filtering, sort cycling with `s` (`sort.ts` verbatim), selection + `d`/`y`/enter handling, empty/loading states. Uses Task 9's `useConcurrentSearch`.
  Commit: `feat(web): port results view`
- [ ] **Task 14: Downloads + ErrorDetail** — four focus groups (downloading/paused/failed/recent), `p`/`c`/`f`/`d`/`x` actions via `post`, enter on failed → `showError`, ErrorDetail overlay dismissed by any key (already in the Task 10 dispatcher).
  Commit: `feat(web): port downloads view and error detail`
- [ ] **Task 15: Seeding** — seeding/paused/missing/idle groups, `p`/`c` actions.
  Commit: `feat(web): port seeding view`
- [ ] **Task 16: Prompts + HelpOverlay** — `FolderPrompt` (list + add-row cursor, `a`/`d`/enter/esc, calls `/api/config/folder`), `TrackersPrompt`, `ThrottlePrompt`, `HelpOverlay` (renders `HELP_GROUPS` from keymap.ts). Prompts render as centered modal `<div>`s over a dimmed backdrop. Port the surviving logic assertions from `FolderPrompt.test.tsx` / `ThrottlePrompt.test.tsx` to `@testing-library/react` (cursor movement, add-row flow, submit/cancel callbacks); drop assertions about Ink rendering internals.
  Commit: `feat(web): port prompts and help overlay`

---

### Task 17: Delete the TUI, previews, and dead dependencies

**Files:**
- Move (web keeps importing them): `src/ui/sort.ts` + `sort.test.ts` → `src/web/sort.ts`, `src/ui/keymap.ts` → `src/web/keymap.ts`, `src/ui/move.ts` + `move.test.ts` → `src/web/move.ts`, `src/ui/theme.ts` → `src/web/theme.ts`, `src/ui/sheen.ts` → `src/web/sheen.ts`, `src/ui/logo.ts` → `src/web/logo.ts`. Fix imports in `src/web/`.
- Delete: `src/ui/` (everything remaining), `src/index.tsx`, `scripts/render-previews.tsx`, `scripts/render-previews-impl.tsx`, `preview/`.
- Modify: `package.json` — remove deps `ink`, `react`; remove devDep `ink-testing-library`; move `react` to devDependencies (the SPA bundles it); remove `"preview"` from `files`; remove the `previews` script; drop keywords `tui`, `terminal`, `ink` and add `web` (description update is part of the README follow-up, out of scope).

- [ ] **Step 1: Move shared modules, fix imports** (`git mv`, then update `src/web/**` import paths).
- [ ] **Step 2: Delete TUI + previews**

```bash
git rm -r src/ui src/index.tsx scripts/render-previews.tsx scripts/render-previews-impl.tsx preview
```

- [ ] **Step 3: Prune package.json + reinstall**

```bash
npm uninstall ink ink-testing-library && npm i -D react
```

(then hand-edit `files` and `scripts` as above)

- [ ] **Step 4: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS; build produces `dist/` incl. `dist/web/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat!: remove the Ink TUI — torlink is now a local web app"
```

---

### Task 18: End-to-end smoke test

- [ ] **Step 1:** `npm run build && node dist/index.js` (let it open the browser).
- [ ] **Step 2:** Walk the TUI parity checklist in the opened page:
  - splash → enter search → results stream in with per-source tags; `s` cycles sort; `y` copies a magnet; `d` starts a download and jumps to Downloads.
  - Downloads: `p` pause/resume, `c` cancel, failed row → enter shows ErrorDetail, `f` retries; recent: `d` re-downloads, `x` clears.
  - Seeding: completed item appears seeding; `p` pauses; `c` removes.
  - `o` folder picker (activate/add/remove), `t` trackers, `r`/`u` throttle — each shows its verbatim notice.
  - `?` help overlay; `Tab` region switch; `Escape` back to splash; mouse clicks select/open everywhere.
  - `q` quits: server process exits, page shows the stopped message.
  - Restart `node dist/index.js`: queue/seeds/history restored.
  - `node dist/index.js "magnet:?xt=urn:btih:<known hash>"`: download present on open.
- [ ] **Step 3:** Fix anything broken (each fix: failing test where feasible → fix → commit).
- [ ] **Step 4:** Final commit if fixes were made; otherwise done. Merge `feat/web-ui` when the user approves.
