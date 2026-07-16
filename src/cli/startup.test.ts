import { describe, expect, it, vi } from "vitest";
import { parsePort, StartupLifecycle } from "./startup";

describe("parsePort", () => {
  it.each([
    [undefined, 0],
    ["", 0],
    ["0", 0],
    ["-1", 0],
    ["65536", 0],
    ["1.5", 0],
    ["not-a-port", 0],
    ["1", 1],
    ["65535", 65535],
  ])("maps %j to %i", (input, expected) => {
    expect(parsePort(input)).toBe(expected);
  });
});

describe("StartupLifecycle", () => {
  it("exits immediately on the first termination while Core is booting", () => {
    const exit = vi.fn();
    const lifecycle = new StartupLifecycle(exit);

    lifecycle.terminate(0);

    expect(lifecycle.stopping).toBe(true);
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits immediately on startup failure before Core is available", () => {
    const exit = vi.fn();
    const lifecycle = new StartupLifecycle(exit);

    lifecycle.fail(1);

    expect(lifecycle.stopping).toBe(true);
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("suspends Core before exiting when the server is not yet available", () => {
    const exit = vi.fn();
    const suspend = vi.fn();
    const lifecycle = new StartupLifecycle(exit);

    lifecycle.setCore({ suspend });
    lifecycle.terminate(0);

    expect(suspend).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("ignores repeated signals, failures, and uncaught reentry", () => {
    const exit = vi.fn();
    const suspend = vi.fn();
    const close = vi.fn();
    const lifecycle = new StartupLifecycle(exit);
    lifecycle.setCore({ suspend });
    lifecycle.setServer({ close });

    lifecycle.terminate(0);
    lifecycle.fail(1);
    lifecycle.terminate(0);
    lifecycle.fail(1);

    expect(suspend).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("ignores Core and server setters after termination", () => {
    const exit = vi.fn();
    const suspend = vi.fn();
    const close = vi.fn();
    const lifecycle = new StartupLifecycle(exit);

    lifecycle.terminate(0);
    lifecycle.setCore({ suspend });
    lifecycle.setServer({ close });

    expect(suspend).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
  });
});
