// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HELP_GROUPS } from "../../ui/keymap";
import { HelpOverlay } from "./HelpOverlay";

afterEach(cleanup);

describe("HelpOverlay", () => {
  it("renders every established keymap group and the closing copy", () => {
    const view = render(<HelpOverlay />);

    for (const group of HELP_GROUPS) {
      expect(view.getByText(group.title)).toBeTruthy();
      for (const hint of group.hints) expect(view.getAllByText(hint.label).length).toBeGreaterThan(0);
    }
    expect(view.getByText(/Your downloaded files always stay on disk/)).toBeTruthy();
    expect(view.getByText(/Press \? or esc to close/)).toBeTruthy();
  });
});
