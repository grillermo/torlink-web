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
