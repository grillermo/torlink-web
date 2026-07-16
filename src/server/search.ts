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

type SourceOutcome =
  | { type: "success"; items: Awaited<ReturnType<Source["search"]>> }
  | { type: "error"; error: unknown }
  | { type: "timeout" }
  | { type: "cancelled" };

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
    let cancelOuter!: () => void;
    const outerAbort = new Promise<SourceOutcome>((resolve) => {
      cancelOuter = () => {
        sourceController.abort();
        resolve({ type: "cancelled" });
      };
    });
    const onAbort = (): void => cancelOuter();
    opts.signal?.addEventListener("abort", onAbort);
    if (opts.signal?.aborted) onAbort();
    let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<SourceOutcome>((resolve) => {
      timer = setTimeout(() => {
        sourceController.abort();
        resolve({ type: "timeout" });
      }, timeoutMs);
    });
    const search = cachedSearch(source, query, { signal: sourceController.signal }).then<
      SourceOutcome,
      SourceOutcome
    >(
      (items) => ({ type: "success", items }),
      (error: unknown) => ({ type: "error", error }),
    );
    try {
      const outcome = await Promise.race([search, timeout, outerAbort]);
      if (opts.signal?.aborted) return;
      if (outcome.type === "success") {
        sendSse(res, "source", { sourceId: source.id, items: outcome.items });
      } else if (outcome.type === "timeout") {
        sendSse(res, "source", { sourceId: source.id, error: "timed out", code: "timed out" });
      } else if (outcome.type === "error") {
        const timedOut = sourceController.signal.aborted;
        sendSse(res, "source", {
          sourceId: source.id,
          error: timedOut
            ? "timed out"
            : outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
          code: errorCode(outcome.error, timedOut),
        });
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }));

  if (!opts.signal?.aborted) sendSse(res, "done", {});
  res.end();
}
