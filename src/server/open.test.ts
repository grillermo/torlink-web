import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

import { openBrowser } from "./open";

describe("openBrowser", () => {
  beforeEach(() => {
    spawn.mockReset();
  });

  it("swallows asynchronous spawn errors", () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    spawn.mockReturnValue(child);

    openBrowser("http://127.0.0.1:3000/?token=test");

    expect(() => child.emit("error", new Error("ENOENT"))).not.toThrow();
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
