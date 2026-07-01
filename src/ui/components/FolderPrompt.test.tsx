import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { FolderPrompt } from "./FolderPrompt";

const ESC = String.fromCharCode(27);
const ENTER = "\r";

// Ink schedules a React render after each keystroke; let it flush before the
// next write so input lands on the up-to-date tree.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

const base = {
  width: 60,
  dirs: ["/home/me/Downloads", "/mnt/media"],
  active: "/home/me/Downloads",
  onActivate: () => {},
  onAdd: () => {},
  onRemove: () => {},
  onCancel: () => {},
};

describe("FolderPrompt", () => {
  it("lists remembered folders and the add row", () => {
    const { lastFrame } = render(<FolderPrompt {...base} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("/home/me/Downloads");
    expect(frame).toContain("/mnt/media");
    expect(frame.toLowerCase()).toContain("add new");
  });

  it("activates the highlighted folder on enter", async () => {
    const onActivate = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onActivate={onActivate} />);
    stdin.write(ENTER);
    await tick();
    expect(onActivate).toHaveBeenCalledWith("/home/me/Downloads");
  });

  it("moves the highlight and activates the next folder", async () => {
    const onActivate = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onActivate={onActivate} />);
    stdin.write("j");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onActivate).toHaveBeenCalledWith("/mnt/media");
  });

  it("removes the highlighted folder on d", async () => {
    const onRemove = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onRemove={onRemove} />);
    stdin.write("j");
    await tick();
    stdin.write("d");
    await tick();
    expect(onRemove).toHaveBeenCalledWith("/mnt/media");
  });

  it("adds a typed folder from the add row", async () => {
    const onAdd = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onAdd={onAdd} />);
    stdin.write("a"); // jump to add input
    await tick();
    stdin.write("/mnt/new");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onAdd).toHaveBeenCalledWith("/mnt/new");
  });

  it("cancels on escape", async () => {
    const onCancel = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onCancel={onCancel} />);
    stdin.write(ESC);
    await tick();
    expect(onCancel).toHaveBeenCalled();
  });
});
