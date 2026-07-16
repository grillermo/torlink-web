// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackersPrompt } from "./TrackersPrompt";

afterEach(cleanup);

describe("TrackersPrompt", () => {
  it("submits parsed trackers and retains the source notice", () => {
    const onSubmit = vi.fn();
    const view = render(<TrackersPrompt width={60} value={["udp://one"]} onSubmit={onSubmit} onCancel={() => {}} />);
    const input = view.getByPlaceholderText("udp://tracker.example:1337/announce, https://...");

    fireEvent.change(input, { target: { value: "udp://one https://two invalid" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith(["udp://one", "https://two"]);
    expect(view.getByText("Separate with commas or spaces. Empty saves an empty list. Applies to new adds.")).toBeTruthy();
  });

  it("cancels on escape outside its native input", () => {
    const onCancel = vi.fn();
    render(<TrackersPrompt width={60} value={[]} onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
