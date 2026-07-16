// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThrottlePrompt } from "./ThrottlePrompt";

afterEach(cleanup);

describe("ThrottlePrompt", () => {
  it("submits the seeded throttle rate on enter", () => {
    const onSubmit = vi.fn();
    const view = render(<ThrottlePrompt width={40} direction="upload" value="200" onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.keyDown(view.getByPlaceholderText("unlimited"), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("200");
  });

  it("filters input to digits and preserves the unlimited notice", () => {
    const onSubmit = vi.fn();
    const view = render(<ThrottlePrompt width={40} direction="download" value="" onSubmit={onSubmit} onCancel={() => {}} />);
    const input = view.getByPlaceholderText("unlimited");

    fireEvent.change(input, { target: { value: "a9b" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("9");
    expect(view.getByText(/0 = unlimited/)).toBeTruthy();
  });

  it("cancels on escape outside its native input", () => {
    const onCancel = vi.fn();
    render(<ThrottlePrompt width={40} direction="download" value="" onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
