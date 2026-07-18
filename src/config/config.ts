import { promises as fs } from "node:fs";
import { configFile, defaultDownloadDir } from "./paths";
import { normalizeDownloadDir } from "./folder";
import { serializeWrites, writeJsonAtomic } from "../util/atomic";

export interface Config {
  downloadDir: string;
  downloadDirs: string[];
  trackers: string[];
  maxDownloadKbps: number; // 0 = unlimited
  maxUploadKbps: number; // 0 = unlimited
  lastRoute?: string; // last visited browser path, e.g. "/all?q=ubuntu"
}

export const defaultConfig: Config = {
  downloadDir: defaultDownloadDir,
  downloadDirs: [defaultDownloadDir],
  trackers: [],
  maxDownloadKbps: 0,
  maxUploadKbps: 0,
  lastRoute: "",
};

// A throttle rate in whole KB/s: a non-negative integer, where 0 means
// unlimited. Anything unusable (negative, fractional, non-number, NaN,
// Infinity) collapses to 0 so a hand-edited config can never wedge the engine.
export function sanitizeKbps(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

// The remembered download folders, cleaned into a stable shape: every entry a
// non-empty normalized path, no duplicates, and the active dir guaranteed
// present (prepended if a hand-edited or legacy config left it out).
export function normalizeDirList(active: string, dirs: unknown): string[] {
  const list = Array.isArray(dirs) ? dirs : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of [active, ...list]) {
    if (typeof entry !== "string") continue;
    const dir = normalizeDownloadDir(entry);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    out.push(dir);
  }
  return out;
}

// The remembered last route, kept only when it is a client path (a string
// starting with "/"). Anything else — non-string, or an absolute URL that
// could point off-app — collapses to "" so the client falls back to splash.
export function sanitizeLastRoute(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") ? value : "";
}

export async function loadConfig(): Promise<Config> {
  let raw: string;
  try {
    raw = await fs.readFile(configFile, "utf8");
  } catch {
    return { ...defaultConfig };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Config>;
    const cfg = { ...defaultConfig, ...parsed };
    if (!cfg.downloadDir || typeof cfg.downloadDir !== "string") {
      cfg.downloadDir = defaultDownloadDir;
    }
    cfg.downloadDir = normalizeDownloadDir(cfg.downloadDir) || defaultDownloadDir;
    cfg.downloadDirs = normalizeDirList(cfg.downloadDir, cfg.downloadDirs);
    cfg.trackers = Array.isArray(cfg.trackers)
      ? cfg.trackers.filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];
    cfg.maxDownloadKbps = sanitizeKbps(cfg.maxDownloadKbps);
    cfg.maxUploadKbps = sanitizeKbps(cfg.maxUploadKbps);
    cfg.lastRoute = sanitizeLastRoute(cfg.lastRoute);
    return cfg;
  } catch {
    return { ...defaultConfig };
  }
}

const write = serializeWrites();

export function saveConfig(config: Config): Promise<void> {
  return write(() => writeJsonAtomic(configFile, config));
}
