import { createReadStream, existsSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";
import type { SourceId } from "../sources/types";
import type { Core } from "./core";
import { runSearchSse } from "./search";
import { snapshot } from "./state";
import { sendSse, startSse } from "./sse";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const MAX_JSON_BODY_BYTES = 1024 * 1024;

class PayloadTooLargeError extends Error {}

export interface TorlinkServerOptions {
  core: Core;
  webRoot: string;
}

interface DownloadInput {
  id?: unknown;
  name?: unknown;
  magnet?: unknown;
  source?: unknown;
  sizeBytes?: unknown;
  seeders?: unknown;
}

interface ValidDownloadInput extends DownloadInput {
  id: string;
  name: string;
  magnet: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    req.resume();
    return Promise.reject(new PayloadTooLargeError());
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.once("error", reject);
    req.once("aborted", () => reject(new Error("request aborted")));
    req.once("end", () => {
      if (tooLarge) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

function isDownloadInput(body: unknown): body is ValidDownloadInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const input = body as DownloadInput;
  return [input.id, input.name, input.magnet].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function decodeActionId(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function serveStatic(res: ServerResponse, webRoot: string, pathname: string): void {
  if (!existsSync(webRoot)) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("torlink web assets missing — run `npm run build` (or use the Vite dev server)");
    return;
  }

  const root = resolve(webRoot);
  let relative: string;
  if (pathname === "/") {
    relative = "index.html";
  } else if (pathname.startsWith("/assets/")) {
    try {
      relative = decodeURIComponent(pathname.slice(1));
    } catch {
      sendJson(res, 404, { error: "not found" });
      return;
    }
  } else if (extname(pathname) === "") {
    // SPA fallback: client-side routes like /downloads/settings render index.html
    relative = "index.html";
  } else {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const file = resolve(root, relative);
  if (!file.startsWith(`${root}${sep}`)) {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    if (!statSync(file).isFile()) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
  } catch {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  const stream = createReadStream(file);
  stream.once("error", () => {
    if (!res.headersSent) sendJson(res, 404, { error: "not found" });
    else res.destroy();
  });
  stream.once("open", () => {
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    stream.pipe(res);
  });
}

export function createTorlinkServer(opts: TorlinkServerOptions): Server {
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
      if (req.method !== "GET") {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      serveStatic(res, opts.webRoot, pathname);
      return;
    }

    if (req.method === "POST" && pathname === "/api/downloads") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(res, 413, { error: "payload too large" });
          return;
        }
        throw error;
      }
      if (!isDownloadInput(body)) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      const result = await opts.core.startDownload({
        id: body.id,
        name: body.name,
        magnet: body.magnet,
        source: typeof body.source === "string" ? body.source as SourceId : undefined,
        sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : undefined,
        seeders: typeof body.seeders === "number" ? body.seeders : undefined,
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    const dl = /^\/api\/downloads\/([^/]+)\/(pause|resume|cancel|retry)$/.exec(pathname);
    if (req.method === "POST" && dl) {
      const id = decodeActionId(dl[1]!);
      if (id === undefined) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      const actions = { pause: "pause", resume: "resume", cancel: "cancel", retry: "retry" } as const;
      opts.core.queue[actions[dl[2] as keyof typeof actions]](id);
      sendJson(res, 200, { ok: true });
      return;
    }

    const history = /^\/api\/history\/([^/]+)\/delete$/.exec(pathname);
    if (req.method === "POST" && history) {
      const id = decodeActionId(history[1]!);
      if (id === undefined) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      opts.core.queue.removeHistory(id);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/history/clear") {
      opts.core.queue.clearHistory();
      sendJson(res, 200, { ok: true });
      return;
    }

    const seed = /^\/api\/seeds\/([^/]+)\/(resume|pause|remove)$/.exec(pathname);
    if (req.method === "POST" && seed) {
      const id = decodeActionId(seed[1]!);
      if (id === undefined) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      const action = seed[2]!;
      if (action === "resume") {
        const historyItem = opts.core.queue.getHistory().find((item) => item.id === id);
        if (!historyItem) {
          sendJson(res, 404, { error: "unknown id" });
          return;
        }
        opts.core.queue.startSeeding(historyItem);
      } else if (action === "pause") {
        opts.core.queue.stopSeeding(id);
      } else {
        opts.core.queue.removeHistory(id);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/config/throttle") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(res, 413, { error: "payload too large" });
          return;
        }
        throw error;
      }
      if (!isRecord(body) || (body.direction !== "download" && body.direction !== "upload")
        || typeof body.value !== "string") {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      const result = opts.core.setThrottle(body.direction, body.value);
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/config/trackers") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(res, 413, { error: "payload too large" });
          return;
        }
        throw error;
      }
      if (!isRecord(body) || !Array.isArray(body.urls) || !body.urls.every((url) => typeof url === "string")) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      const result = opts.core.setTrackers(body.urls);
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/config/folder") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(res, 413, { error: "payload too large" });
          return;
        }
        throw error;
      }
      if (!isRecord(body) || (body.action !== "use" && body.action !== "remove")
        || typeof body.dir !== "string") {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      const result = body.action === "use"
        ? await opts.core.useFolder(body.dir)
        : opts.core.removeFolder(body.dir);
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/last-route") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(res, 413, { error: "payload too large" });
          return;
        }
        throw error;
      }
      if (!isRecord(body) || typeof body.path !== "string" || !body.path.startsWith("/")) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      opts.core.setLastRoute(body.path);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/events") {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;
      const onUpdate = (): void => {
        if (timer || closed) return;
        timer = setTimeout(() => {
          timer = null;
          if (!closed) sendSse(res, "state", snapshot(opts.core.queue, opts.core.config));
        }, 500);
      };
      const onCompleted = (name: string): void => {
        if (!closed) sendSse(res, "completed", { name });
      };
      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        opts.core.off("update", onUpdate);
        opts.core.off("completed", onCompleted);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      res.once("close", cleanup);
      res.once("error", cleanup);
      opts.core.on("update", onUpdate);
      opts.core.on("completed", onCompleted);
      startSse(res);
      if (!closed) sendSse(res, "state", snapshot(opts.core.queue, opts.core.config));
      return;
    }

    if (req.method === "GET" && pathname === "/api/search") {
      const controller = new AbortController();
      let closed = false;
      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        res.off("close", cleanup);
        res.off("error", cleanup);
        controller.abort();
      };
      const onRunError = (): void => {
        cleanup();
        try {
          if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
          else if (!res.destroyed) res.destroy();
        } catch {
          if (!res.destroyed) res.destroy();
        }
      };
      res.once("close", cleanup);
      res.once("error", cleanup);
      void runSearchSse(res, url.searchParams.get("q") ?? "", { signal: controller.signal })
        .then(cleanup, onRunError)
        .catch(() => {});
      return;
    }

    sendJson(res, 404, { error: "not found" });
  }
}
