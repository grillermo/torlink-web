export interface ActionResponse {
  ok: boolean;
  notice?: string;
  error?: string;
}

export async function post(path: string, body?: unknown): Promise<ActionResponse> {
  try {
    const res = await fetch(path, {
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
