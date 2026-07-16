// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COLOR } from "../../ui/theme";
import { SHEEN_TICK_MS } from "../../ui/sheen";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

const themeCss = readFileSync("src/web/theme.css", "utf8");

function ruleBody(selector: string): string {
  const start = themeCss.indexOf(`.${selector}`);
  expect(start, `expected .${selector} CSS rule`).toBeGreaterThanOrEqual(0);
  const open = themeCss.indexOf("{", start);
  return themeCss.slice(open + 1, themeCss.indexOf("}", open));
}

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

  it("retains an arbitrary paused color through the fallback class and custom property", () => {
    const view = render(<ProgressBar pct={50} width={4} color="#7c7785" />);

    for (const cell of view.container.querySelectorAll<HTMLElement>(".bar-cell")) {
      expect(cell.classList.contains("bar-color-custom")).toBe(true);
      expect(cell.style.getPropertyValue("--bar-color")).toBe("#7c7785");
      expect(cell.style.color).toBe("");
    }
  });

  it("keeps a custom base through animated sheen cells", () => {
    vi.useFakeTimers();
    const view = render(<ProgressBar pct={100} width={8} color="#a3ff8f" animate />);
    act(() => vi.advanceTimersByTime(SHEEN_TICK_MS));
    const cells = view.container.querySelectorAll<HTMLElement>(".bar-cell");

    expect(cells).toHaveLength(8);
    expect([...cells].some((cell) => cell.classList.contains("bar-sheen-low") || cell.classList.contains("bar-sheen-mid") || cell.classList.contains("bar-sheen-peak"))).toBe(true);
    for (const cell of cells) {
      expect(cell.classList.contains("bar-color-custom")).toBe(true);
      expect(cell.style.getPropertyValue("--bar-color")).toBe("#a3ff8f");
      expect(cell.style.color).toBe("");
    }
  });

  it("assigns named tones to CSS base colors that cells and sheens consume", () => {
    const tones: ReadonlyArray<readonly [className: string, color: string, token: string]> = [
      ["good", COLOR.good, "--color-good"],
      ["warn", COLOR.warn, "--color-warn"],
      ["bad", COLOR.bad, "--color-bad"],
      ["accent", COLOR.accent, "--color-accent"],
    ];

    const view = render(<ProgressBar pct={100} width={2} color={COLOR.good} />);
    for (const [className, color, token] of tones) {
      view.rerender(<ProgressBar pct={100} width={2} color={color} />);
      for (const cell of view.container.querySelectorAll<HTMLElement>(".bar-cell")) {
        expect(cell.classList.contains(className)).toBe(true);
        expect(cell.classList.contains("bar-color-custom")).toBe(false);
        expect(cell.style.getPropertyValue("--bar-color")).toBe("");
      }
      expect(ruleBody(className)).toContain(`--bar-base-color: var(${token});`);
    }
    expect(ruleBody("bar-color-custom")).toContain("--bar-base-color: var(--bar-color);");
    expect(ruleBody("bar-cell")).toContain("color: color-mix(in oklch, var(--bar-base-color) 72%, var(--color-bg));");
    expect(ruleBody("bar-sheen-low")).toContain("color: color-mix(in oklch, var(--bar-base-color) 76%, var(--color-bright));");
    expect(ruleBody("bar-sheen-mid")).toContain("color: color-mix(in oklch, var(--bar-base-color) 52%, var(--color-bright));");
    expect(ruleBody("bar-sheen-peak")).toContain("color: var(--color-bright);");
  });
});
