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

  setLastRoute(path: string): void {
    this.config = { ...this.config, lastRoute: path };
    void saveConfig(this.config);
  }

  suspend(): void {
    this.queue.suspend();
  }
}
