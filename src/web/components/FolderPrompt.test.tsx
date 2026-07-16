// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderPrompt } from "./FolderPrompt";

afterEach(cleanup);

const props = {
  width: 60,
  dirs: ["/home/me/Downloads", "/mnt/media"],
  active: "/home/me/Downloads",
  onActivate: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onCancel: vi.fn(),
};

describe("FolderPrompt", () => {
  it("moves its cursor and activates the selected folder on enter", () => {
    const onActivate = vi.fn();
    const view = render(<FolderPrompt {...props} onActivate={onActivate} />);

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onActivate).toHaveBeenCalledWith("/mnt/media");
    expect(view.getByText("+ add new folder…")).toBeTruthy();
  });

  it("opens the add row with a and submits its value", () => {
    const onAdd = vi.fn();
    const view = render(<FolderPrompt {...props} onAdd={onAdd} />);

    fireEvent.keyDown(window, { key: "a" });
    const input = view.getByPlaceholderText("~/Downloads/torlink");
    fireEvent.change(input, { target: { value: "/mnt/new" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledWith("/mnt/new");
  });

  it("removes the selected folder and handles both escape paths", () => {
    const onRemove = vi.fn();
    const onCancel = vi.fn();
    const view = render(<FolderPrompt {...props} onRemove={onRemove} onCancel={onCancel} />);

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "d" });
    expect(onRemove).toHaveBeenCalledWith("/mnt/media");

    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(view.getByPlaceholderText("~/Downloads/torlink"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(view.getByText("+ add new folder…")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
