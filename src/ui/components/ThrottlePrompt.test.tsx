import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { ThrottlePrompt } from "./ThrottlePrompt";

const ESC = String.fromCharCode(27);
const ENTER = "\r";

// Ink schedules a React render after each keystroke; let it flush before the
// next write so input lands on the up-to-date tree.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("ThrottlePrompt", () => {
  it("shows the direction label and seeded rate", () => {
    const { lastFrame } = render(
      <ThrottlePrompt width={40} direction="download" value="1500" onSubmit={() => {}} onCancel={() => {}} />,
    );
    const frame = (lastFrame() ?? "").toLowerCase();
    expect(frame).toContain("download");
    expect(frame).toContain("1500");
  });

  it("submits the seeded rate unchanged on enter", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <ThrottlePrompt width={40} direction="upload" value="200" onSubmit={onSubmit} onCancel={() => {}} />,
    );
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("200");
  });

  it("edits the value before submitting", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <ThrottlePrompt width={40} direction="download" value="" onSubmit={onSubmit} onCancel={() => {}} />,
    );
    stdin.write("5");
    await tick();
    stdin.write("0");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("50");
  });

  it("ignores non-digit characters", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <ThrottlePrompt width={40} direction="upload" value="" onSubmit={onSubmit} onCancel={() => {}} />,
    );
    stdin.write("a");
    await tick();
    stdin.write("9");
    await tick();
    stdin.write("b");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("9");
  });

  it("cancels on escape", async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <ThrottlePrompt width={40} direction="download" value="" onSubmit={() => {}} onCancel={onCancel} />,
    );
    stdin.write(ESC);
    await tick();
    expect(onCancel).toHaveBeenCalled();
  });
});
