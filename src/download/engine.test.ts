import { describe, expect, it } from "vitest";
import { TorrentEngine } from "./engine";

describe("TorrentEngine throttle limits", () => {
  it("defaults to unlimited (-1) before any client exists", () => {
    const engine = new TorrentEngine();
    expect(engine.currentLimits()).toEqual({ download: -1, upload: -1 });
  });

  it("stores limits without spinning up a client", () => {
    const engine = new TorrentEngine();
    // No torrent added, so this must not construct webtorrent — it only records
    // the rates for the next ensureClient().
    engine.setLimits(1536000, -1);
    expect(engine.currentLimits()).toEqual({ download: 1536000, upload: -1 });
    expect(engine.listenPort()).toBe(null);
  });
});
