const KEY = "torlink-token";

export function getToken(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) {
    sessionStorage.setItem(KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(KEY) ?? "";
}

export function apiUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", getToken());
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface ActionResponse {
  ok: boolean;
  notice?: string;
  error?: string;
}

export async function post(path: string, body?: unknown): Promise<ActionResponse> {
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ActionResponse;
    return { ok: res.ok && data.ok !== false, notice: data.notice, error: data.error };
  } catch {
    return { ok: false, error: "torlink server unreachable" };
  }
}
