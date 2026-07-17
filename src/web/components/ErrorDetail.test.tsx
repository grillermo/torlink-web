// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "../../download/types";
import { ErrorDetail } from "./ErrorDetail";

const item: QueueItem = {
  id: "failed", name: "failed.iso", magnet: "magnet:?failed", dir: "/downloads", status: "failed",
  progress: 0, totalBytes: 0, downloadedBytes: 0, speed: 0, peers: 0, error: "disk full", addedAt: 1,
};

function renderDetail(overrides: Partial<QueueItem> = {}) {
  const onClose = vi.fn();
  const onRetry = vi.fn();
  const view = render(<ErrorDetail item={{ ...item, ...overrides }} onClose={onClose} onRetry={onRetry} />);
  return { ...view, onClose, onRetry };
}

afterEach(cleanup);

describe("ErrorDetail", () => {
  it("preserves the failure copy and renders as an error overlay", () => {
    const view = renderDetail();

    expect(view.getByRole("dialog", { name: "Download failed" })).toBeTruthy();
    expect(view.getByText("failed.iso")).toBeTruthy();
    expect(view.getByText("disk full")).toBeTruthy();
    expect(view.getByText("Press esc to close, then f to retry")).toBeTruthy();
  });

  it("uses the fallback error copy", () => {
    const view = renderDetail({ error: undefined });
    expect(view.getByText("The download failed without a reported error.")).toBeTruthy();
  });

  it("retries and closes by tap", () => {
    const view = renderDetail();
    fireEvent.click(view.getByRole("button", { name: "retry" }));
    expect(view.onRetry).toHaveBeenCalledOnce();
    fireEvent.click(view.getByRole("button", { name: "close" }));
    expect(view.onClose).toHaveBeenCalledOnce();
  });
});
