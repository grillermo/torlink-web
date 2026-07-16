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

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

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
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
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

  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
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
      const body = await readJson(req);
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

    sendJson(res, 404, { error: "not found" });
  }
}
