// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Spinner", () => {
  it("shows its label and advances through the Ink glyph sequence", () => {
    vi.useFakeTimers();
    const view = render(<Spinner label="Searching" />);

    expect(view.container.textContent).toBe("⠋ Searching");
    act(() => vi.advanceTimersByTime(80));
    expect(view.container.textContent).toBe("⠙ Searching");
  });
});

describe("ProgressBar", () => {
  it("clamps progress and retains filled and empty terminal cells", () => {
    const view = render(<ProgressBar pct={50} width={4} />);
    expect(view.container.textContent).toBe("██░░");

    view.rerender(<ProgressBar pct={-1} width={4} />);
    expect(view.container.textContent).toBe("░░░░");
  });
});
