import type { ServerResponse } from "node:http";
import { cachedSearch } from "../sources/cache";
import { SOURCES } from "../sources/registry";
import type { Source } from "../sources/types";
import { HttpError } from "../util/net";
import { sendSse, startSse } from "./sse";

const PER_SOURCE_TIMEOUT_MS = 25_000;

export interface SearchSseOptions {
  sources?: readonly Source[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function errorCode(error: unknown, timedOut: boolean): string {
  if (timedOut) return "timed out";
  if (error instanceof HttpError && error.status > 0) return `HTTP ${error.status}`;
  return "no response";
}

export async function runSearchSse(
  res: ServerResponse,
  query: string,
  opts: SearchSseOptions = {},
): Promise<void> {
  const sources = opts.sources ?? SOURCES;
  const timeoutMs = opts.timeoutMs ?? PER_SOURCE_TIMEOUT_MS;
  startSse(res);

  await Promise.all(sources.map(async (source) => {
    const sourceController = new AbortController();
    const onAbort = (): void => sourceController.abort();
    opts.signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => sourceController.abort(), timeoutMs);
    try {
      const items = await cachedSearch(source, query, { signal: sourceController.signal });
      if (!opts.signal?.aborted) sendSse(res, "source", { sourceId: source.id, items });
    } catch (error: unknown) {
      if (opts.signal?.aborted) return;
      const timedOut = sourceController.signal.aborted;
      sendSse(res, "source", {
        sourceId: source.id,
        error: timedOut ? "timed out" : error instanceof Error ? error.message : String(error),
        code: errorCode(error, timedOut),
      });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }));

  if (!opts.signal?.aborted) sendSse(res, "done", {});
  res.end();
}
