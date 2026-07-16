// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { getToken, apiUrl, post } from "./api";

describe("api token plumbing", () => {
  it("reads the token from the query string and caches it", () => {
    window.history.replaceState(null, "", "/?token=abc123");
    sessionStorage.clear();
    expect(getToken()).toBe("abc123");
    window.history.replaceState(null, "", "/");
    expect(getToken()).toBe("abc123"); // from sessionStorage now
    expect(apiUrl("/api/quit")).toBe("/api/quit?token=abc123");
    expect(apiUrl("/api/search?q=x")).toBe("/api/search?q=x&token=abc123");
  });
});

describe("post", () => {
  it("uses the tokenized URL and reports JSON action failures", async () => {
    window.history.replaceState(null, "", "/?token=abc123");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "nope" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(post("/api/quit", { now: true })).resolves.toEqual({
      ok: false,
      error: "nope",
      notice: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/quit?token=abc123", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ now: true }),
    });
  });

  it("returns the unreachable error when posting fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(post("/api/quit")).resolves.toEqual({
      ok: false,
      error: "torlink server unreachable",
    });
  });
});
