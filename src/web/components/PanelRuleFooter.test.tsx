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
    expect(panel?.getAttribute("style")).toContain("width: 10ch");
  });
});

describe("Rule", () => {
  it("renders at least one terminal rule glyph", () => {
    expect(render(<Rule width={0} />).getByText("─")).toBeTruthy();
  });
});

describe("Footer", () => {
  it("keeps hint order and clicks through the key represented by a hint", () => {
    const keys: string[] = [];
    window.addEventListener("keydown", (event) => keys.push(event.key), { once: true });
    const view = render(<Footer hints={[{ keys: "q", label: "Quit" }, { keys: "?", label: "Keys" }]} />);

    const buttons = view.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["q Quit", "? Keys"]);
    const quit = buttons[0];
    if (!quit) throw new Error("Expected a Quit hint button");
    fireEvent.click(quit);
    expect(keys).toEqual(["q"]);
  });
});
