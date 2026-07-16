import { describe, expect, it, afterAll, afterEach, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Core as CoreInstance } from "./core";

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "torlink-core-"));
process.env.TORLINK_STATE_DIR = stateDir;
const { defaultConfig, saveConfig } = await import("../config/config");
const { Core } = await import("./core");

const cores: CoreInstance[] = [];
beforeEach(async () => {
  await saveConfig({ ...defaultConfig });
});

afterEach(() => {
  for (const c of cores.splice(0)) c.suspend();
});

afterAll(async () => {
  await saveConfig({ ...defaultConfig });
  await fs.rm(stateDir, { recursive: true, force: true });
});

async function boot(): Promise<CoreInstance> {
  const c = await Core.boot();
  cores.push(c);
  return c;
}

describe("Core actions", () => {
  it("boots with a config and empty queue", async () => {
    const core = await boot();
    expect(core.config.downloadDir).toBeTruthy();
    expect(core.queue.getItems()).toEqual([]);
  });

  it("setThrottle parses raw input and reports the TUI notice", async () => {
    const core = await boot();
    const r = core.setThrottle("download", "500");
    expect(r.ok).toBe(true);
    expect(r.notice).toBe("Throttle: ↓ 500 KB/s");
    expect(core.config.maxDownloadKbps).toBe(500);
    // unchanged value -> unchanged notice
    expect(core.setThrottle("download", "500").notice).toBe("↓ throttle unchanged.");
    // blank means no cap
    expect(core.setThrottle("download", "").notice).toBe("Throttle: ↓ unlimited");
    expect(core.config.maxDownloadKbps).toBe(0);
  });

  it("setTrackers detects no-op and reports counts", async () => {
    const core = await boot();
    expect(core.setTrackers([]).notice).toBe("Trackers unchanged.");
    expect(core.setTrackers(["udp://a:1"]).notice).toBe("Saved 1 tracker.");
    expect(core.setTrackers([]).notice).toBe("Cleared extra trackers.");
  });

  it("useFolder normalizes, creates and activates; removeFolder refuses the active dir", async () => {
    const core = await boot();
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = path.join(os.tmpdir(), "torlink-test-state", "dl-a");
    const r = await core.useFolder(dir);
    expect(r.ok).toBe(true);
    expect(core.config.downloadDir).toBe(dir);
    expect(core.config.downloadDirs).toContain(dir);
    expect(core.removeFolder(dir).notice).toBe("Can't remove the active folder.");
  });

  it("emits update when config changes", async () => {
    const core = await boot();
    let hits = 0;
    core.on("update", () => hits++);
    core.setThrottle("upload", "100");
    expect(hits).toBe(1);
  });
});
