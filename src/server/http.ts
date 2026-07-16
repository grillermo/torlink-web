import { randomBytes } from "node:crypto";
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
  token: string;
  webRoot: string;
  onQuit: () => void;
}

interface DownloadInput {
  id?: unknown;
  name?: unknown;
  magnet?: unknown;
  source?: unknown;
  sizeBytes?: unknown;
}

interface ValidDownloadInput extends DownloadInput {
  id: string;
  name: string;
  magnet: string;
}

export function createToken(): string {
  return randomBytes(24).toString("hex");
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

function serveStatic(res: ServerResponse, webRoot: string, pathname: string): void {
  if (!existsSync(webRoot)) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("torlink web assets missing — run `npm run build` (or use the Vite dev server)");
    return;
  }

  const root = resolve(webRoot);
  let relative: string;
  try {
    relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
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
      if (req.method !== "GET" || (pathname !== "/" && !pathname.startsWith("/assets/"))) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      serveStatic(res, opts.webRoot, pathname);
      return;
    }

    const given = url.searchParams.get("token") ?? req.headers["x-torlink-token"];
    if (given !== opts.token) {
      sendJson(res, 401, { error: "unauthorized" });
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
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/quit") {
      res.once("finish", opts.onQuit);
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
      const onClose = (): void => controller.abort();
      req.once("close", onClose);
      void runSearchSse(res, url.searchParams.get("q") ?? "", { signal: controller.signal })
        .finally(() => req.off("close", onClose));
      return;
    }

    sendJson(res, 404, { error: "not found" });
  }
}
