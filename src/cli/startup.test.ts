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
  it("defers the first termination until Core is available", () => {
    const exit = vi.fn();
    const suspend = vi.fn();
    const lifecycle = new StartupLifecycle(exit);

    lifecycle.terminate(0);

    expect(lifecycle.stopping).toBe(true);
    expect(exit).not.toHaveBeenCalled();

    lifecycle.setCore({ suspend });

    expect(suspend).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("forces exit on a repeated termination while Core is unavailable", () => {
    const exit = vi.fn();
    const lifecycle = new StartupLifecycle(exit);

    lifecycle.terminate(0);
    lifecycle.terminate(0);

    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("suspends Core and closes the server once on startup failure", () => {
    const exit = vi.fn();
    const suspend = vi.fn();
    const close = vi.fn();
    const lifecycle = new StartupLifecycle(exit);
    lifecycle.setCore({ suspend });
    lifecycle.setServer({ close });

    lifecycle.fail(1);
    lifecycle.fail(1);

    expect(suspend).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenLastCalledWith(1);
  });
});
