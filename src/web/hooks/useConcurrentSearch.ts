import { useEffect, useState } from "react";
import { SOURCES } from "../../sources/registry";
import type { SourceId, TorrentResult } from "../../sources/types";

export interface SourceState {
  loading: boolean;
  error: string | null;
  code: string | null;
  count: number;
}

export interface ConcurrentSearchState {
  results: TorrentResult[];
  perSource: Record<SourceId, SourceState>;
  loading: boolean;
  done: number;
  total: number;
}

function blankPerSource(loading: boolean): Record<SourceId, SourceState> {
  const out = {} as Record<SourceId, SourceState>;
  for (const s of SOURCES) out[s.id] = { loading, error: null, code: null, count: 0 };
  return out;
}

function dedupe(list: TorrentResult[]): TorrentResult[] {
  const byHash = new Map<string, TorrentResult>();
  for (const r of list) {
    const existing = byHash.get(r.infoHash);
    if (!existing || r.seeders > existing.seeders) byHash.set(r.infoHash, r);
  }
  return [...byHash.values()];
}

// torlink's default ordering: healthiest first. The results view can re-sort
// on demand (the `s` key), and its "none"/default state preserves this order.
function defaultOrder(list: TorrentResult[]): TorrentResult[] {
  return list.sort((a, b) => {
    if (b.seeders !== a.seeders) return b.seeders - a.seeders;
    return (b.added ?? 0) - (a.added ?? 0);
  });
}

function idleState(): ConcurrentSearchState {
  return {
    results: [],
    perSource: blankPerSource(false),
    loading: false,
    done: 0,
    total: SOURCES.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isKnownSourceId(
  value: unknown,
  perSource: Record<SourceId, SourceState>,
): value is SourceId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(perSource, value);
}

function isTorrentResult(
  value: unknown,
  perSource: Record<SourceId, SourceState>,
): value is TorrentResult {
  if (!isRecord(value)) return false;
  return typeof value.infoHash === "string"
    && typeof value.name === "string"
    && typeof value.sizeBytes === "number"
    && typeof value.seeders === "number"
    && typeof value.leechers === "number"
    && isKnownSourceId(value.source, perSource)
    && typeof value.magnet === "string"
    && (value.numFiles === undefined || typeof value.numFiles === "number")
    && (value.added === undefined || typeof value.added === "number");
}

export function useConcurrentSearch(query: string): ConcurrentSearchState {
  const [state, setState] = useState<ConcurrentSearchState>(idleState);

  useEffect(() => {
    let alive = true;
    let complete = false;
    const collected: TorrentResult[] = [];
    const per = blankPerSource(true);
    const settled = new Set<SourceId>();

    const publish = (loading: boolean): void => {
      setState({
        results: defaultOrder(dedupe(collected.slice())),
        perSource: { ...per },
        loading,
        done: settled.size,
        total: SOURCES.length,
      });
    };

    setState({
      results: [],
      perSource: { ...per },
      loading: true,
      done: 0,
      total: SOURCES.length,
    });

    const es = new EventSource(`/api/search?q=${encodeURIComponent(query)}`);
    es.addEventListener("source", (e) => {
      if (!alive) return;
      try {
        const data = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isRecord(data) || !isKnownSourceId(data.sourceId, per)) return;
        const sourceId = data.sourceId;
        if (settled.has(sourceId)) return;
        if (typeof data.error === "string") {
          if (typeof data.code !== "string") return;
          per[sourceId] = {
            loading: false,
            error: data.error,
            code: data.code,
            count: 0,
          };
        } else {
          if (!Array.isArray(data.items) || !data.items.every((item) => isTorrentResult(item, per))) {
            return;
          }
          const items = data.items;
          collected.push(...items);
          per[sourceId] = { loading: false, error: null, code: null, count: items.length };
        }
        settled.add(sourceId);
        publish(!complete && settled.size < SOURCES.length);
      } catch {
        // Ignore malformed event data; the server will still send its done event.
      }
    });
    es.addEventListener("done", () => {
      if (!alive) return;
      complete = true;
      es.close();
      publish(false);
    });
    es.onerror = () => {
      if (!alive || !complete) return;
      es.close();
      publish(false);
    };

    return () => {
      alive = false;
      es.close();
    };
  }, [query]);

  return state;
}
