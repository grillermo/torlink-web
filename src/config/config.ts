import { promises as fs } from "node:fs";
import { configFile, defaultDownloadDir } from "./paths";
import { serializeWrites, writeJsonAtomic } from "../util/atomic";

export interface Config {
  downloadDir: string;
  maxDownloadKbps: number; // 0 = unlimited
  maxUploadKbps: number; // 0 = unlimited
}

export const defaultConfig: Config = {
  downloadDir: defaultDownloadDir,
  maxDownloadKbps: 0,
  maxUploadKbps: 0,
};

// A throttle rate in whole KB/s: a non-negative integer, where 0 means
// unlimited. Anything unusable (negative, fractional, non-number, NaN,
// Infinity) collapses to 0 so a hand-edited config can never wedge the engine.
export function sanitizeKbps(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
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
    cfg.maxDownloadKbps = sanitizeKbps(cfg.maxDownloadKbps);
    cfg.maxUploadKbps = sanitizeKbps(cfg.maxUploadKbps);
    return cfg;
  } catch {
    return { ...defaultConfig };
  }
}

const write = serializeWrites();

export function saveConfig(config: Config): Promise<void> {
  return write(() => writeJsonAtomic(configFile, config));
}
