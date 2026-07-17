import { createContext, useContext } from "react";
import type { Config } from "../config/config";
import type { QueueItem } from "../download/types";
import type { AppState } from "../server/state";
import type { SourceGroup, SourceId } from "../sources/types";

export type View = "splash" | "browser";

export type Category = "all" | "games" | "movies" | "tv" | "anime";

export type Section = Category | "downloads" | "seeding";

export const CATEGORIES: { key: Category; label: string; group?: SourceGroup }[] = [
  { key: "all", label: "All" },
  { key: "games", label: "Games", group: "Games" },
  { key: "movies", label: "Movies", group: "Movies" },
  { key: "tv", label: "TV", group: "TV" },
  { key: "anime", label: "Anime", group: "Anime" },
];

export type Region = "sidebar" | "content" | "help";

export type CaptureMode = "none" | "text" | "esc";

export type DownloadFocus = "downloading" | "paused" | "failed" | "recent";

export type SeedFocus = "seeding" | "paused" | "missing" | "idle";

export interface Store {
  config: Config;
  state: AppState;
  view: View; setView(v: View): void;
  query: string; submitQuery(q: string): void;
  section: Section; setSection(s: Section): void;
  region: Region; setRegion(r: Region): void;
  captureMode: CaptureMode; setCaptureMode(m: CaptureMode): void;
  downloadFocus: DownloadFocus | null; setDownloadFocus(f: DownloadFocus | null): void;
  seedFocus: SeedFocus | null; setSeedFocus(f: SeedFocus | null): void;
  startDownload(input: { id: string; name: string; magnet: string; source?: SourceId; sizeBytes?: number; seeders?: number }): void;
  cancelDownload(id: string): void;
  toggleDownload(id: string, action: "pause" | "resume"): void;
  retryFailed(): void;
  removeHistory(id: string): void;
  clearHistory(): void;
  toggleSeed?(id: string, action: "pause" | "resume"): void;
  copyMagnet(input: { name: string; magnet: string }): void;
  showError(item: QueueItem): void;
  notice: string | null; setNotice(s: string | null): void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Store not available");
  return store;
}
