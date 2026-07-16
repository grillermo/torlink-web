import { useEffect, useState } from "react";
import { SOURCES } from "../../sources/registry";
import type { SourceId, TorrentResult } from "../../sources/types";
import { apiUrl } from "../api";

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

    const es = new EventSource(apiUrl(`/api/search?q=${encodeURIComponent(query)}`));
    es.addEventListener("source", (e) => {
      if (!alive) return;
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          sourceId?: unknown;
          items?: unknown;
          error?: unknown;
          code?: unknown;
        };
        if (typeof data.sourceId !== "string" || !(data.sourceId in per)) return;
        const sourceId = data.sourceId as SourceId;
        const items = Array.isArray(data.items) ? data.items as TorrentResult[] : [];
        if (typeof data.error === "string") {
          per[sourceId] = {
            loading: false,
            error: data.error,
            code: typeof data.code === "string" ? data.code : null,
            count: 0,
          };
        } else {
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
