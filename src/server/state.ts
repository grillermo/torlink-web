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
