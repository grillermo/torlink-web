// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Footer } from "./Footer";
import { Panel } from "./Panel";
import { Rule } from "./Rule";

afterEach(cleanup);

describe("Panel", () => {
  it("renders the capped count label, rounded frame, focus state, and child content", () => {
    const view = render(
      <Panel title="downloads" count="(2)" width={8} focused height={3}>
        <span>ready</span>
      </Panel>,
    );

    expect(view.getByText("Downloads (2)")).toBeTruthy();
    expect(view.getByText("ready")).toBeTruthy();
    const panel = view.container.querySelector(".panel");
    expect(panel?.classList.contains("focused")).toBe(true);
    expect(panel?.getAttribute("style")).toContain("--panel-width: 10ch");
  });
});

describe("Rule", () => {
  it("renders at least one terminal rule glyph", () => {
    expect(render(<Rule width={0} />).getByText("─")).toBeTruthy();
  });
});

describe("Footer", () => {
  it("keeps hint order and clicks through each represented keyboard key", () => {
    const keys: string[] = [];
    window.addEventListener("keydown", (event) => keys.push(event.key));
    const view = render(
      <Footer hints={[
        { keys: "o", label: "Folder" },
        { keys: "?", label: "Keys" },
        { keys: "↵", label: "Confirm" },
        { keys: "↑↓←→", label: "Move" },
        { keys: "tab", label: "Switch pane" },
      ]} />,
    );

    const buttons = view.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "o Folder", "? Keys", "↵ Confirm", "↑↓←→ Move", "tab Switch pane",
    ]);
    buttons.forEach((button) => fireEvent.click(button));
    expect(keys).toEqual(["o", "?", "Enter", "ArrowDown", "Tab"]);
  });
});
