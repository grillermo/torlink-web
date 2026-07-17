// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { post } from "./api";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("post", () => {
  it("posts to the path and reports JSON action failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "nope" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(post("/api/config/trackers", { now: true })).resolves.toEqual({
      ok: false,
      error: "nope",
      notice: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/config/trackers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ now: true }),
    });
  });

  it("returns the unreachable error when posting fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(post("/api/config/trackers")).resolves.toEqual({
      ok: false,
      error: "torlink server unreachable",
    });
  });
});
