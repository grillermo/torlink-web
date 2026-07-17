import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSource, SOURCES } from "../../sources/registry";
import type { Source, TorrentResult } from "../../sources/types";
import { cleanText, formatBytes, formatRelative, truncate } from "../../util/format";
import { wrapStep } from "../move";
import { nextSort, sortArrow, sortLabel, sortResults, toggleSort, type Sort, type SortField } from "../sort";
import { ICON } from "../theme";
import { useConcurrentSearch } from "../hooks/useConcurrentSearch";
import { CATEGORIES, useStore } from "../store";
import { FilterChips } from "./FilterChips";
import { Panel } from "./Panel";
import { RowActions } from "./RowActions";
import { Rule } from "./Rule";
import { SearchBar } from "./SearchBar";
import { Spinner } from "./Spinner";

type Mode = "list" | "search" | "detail";

const PLACEHOLDER = "Search or paste a magnet link…";
const WIDTH = 80;

function sourceStyle(source: TorrentResult["source"]): { tag: string; tone: string } {
  switch (source) {
    case "fitgirl": return { tag: "FG", tone: "accent" };
    case "yts": return { tag: "YTS", tone: "good" };
    case "eztv": return { tag: "EZTV", tone: "warn" };
    case "nyaa": return { tag: "NYAA", tone: "bright" };
    case "subsplease": return { tag: "SUB", tone: "alt" };
    case "solid": return { tag: "SLD", tone: "source-solid" };
    case "tpb-movies":
    case "tpb-tv": return { tag: "TPB", tone: "source-tpb" };
    case "x1337-movies":
    case "x1337-tv": return { tag: "1337", tone: "source-1337x" };
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="row result-detail-row"><span className="dim result-detail-label">{label}</span><span className="trunc">{value}</span></div>;
}

function Detail({ result, onDownload, onCopy, onBack }: {
  result: TorrentResult;
  onDownload(): void;
  onCopy(): void;
  onBack(): void;
}) {
  const source = sourceStyle(result.source);
  const health = result.seeders || result.leechers
    ? <><span className={result.seeders > 0 ? "good b" : ""}>{result.seeders}</span><span className="dim">{` seeders ${ICON.dot} ${result.leechers} leechers`}</span></>
    : <span className="dim">unknown</span>;
  return <div className="col result-detail">
    <div className="row"><strong className="result-detail-title">{cleanText(result.name)}</strong><span className={`b result-source ${source.tone}`}>{source.tag}</span></div>
    <Rule width={WIDTH - 4} />
    <div className="col mt">
      <DetailRow label="Size" value={result.sizeBytes > 0 ? formatBytes(result.sizeBytes) : <span className="dim">unknown</span>} />
      <DetailRow label="Health" value={health} />
      {result.numFiles ? <DetailRow label="Files" value={<span className="dim">{String(result.numFiles)}</span>} /> : null}
      {formatRelative(result.added) ? <DetailRow label="Added" value={<span className="dim">{formatRelative(result.added)}</span>} /> : null}
      <DetailRow label="Hash" value={<span className="alt">{result.infoHash}</span>} />
      <DetailRow label="Magnet" value={<span className="alt">{result.magnet}</span>} />
    </div>
    <p className="result-actions kb-only"><span className="accent b">d</span> Download <span className="dim">{` ${ICON.dot} `}</span><span className="accent b">y</span> Copy magnet <span className="dim">{` ${ICON.dot} `}</span><span className="alt">esc</span><span className="dim"> back</span></p>
    <RowActions actions={[
      { label: "download", onPress: onDownload },
      { label: "copy magnet", onPress: onCopy },
      { label: "back", onPress: onBack },
    ]} label="Result actions" />
  </div>;
}

export function Results() {
  const { query, submitQuery, section, region, setRegion, setCaptureMode, startDownload, copyMagnet } = useStore();
  const search = useConcurrentSearch(query);
  const [sort, setSort] = useState<Sort>("none");
  const [mode, setMode] = useState<Mode>("list");
  const [cursor, setCursor] = useState(0);
  const [detail, setDetail] = useState<TorrentResult | null>(null);
  const selectedRow = useRef<HTMLButtonElement>(null);
  const focused = region === "content";
  const activeCategory = CATEGORIES.find((category) => category.key === section);
  const results = useMemo(() => {
    const filtered = activeCategory?.group
      ? search.results.filter((result) => getSource(result.source).group === activeCategory.group)
      : search.results;
    return sortResults(filtered, sort);
  }, [activeCategory?.group, search.results, sort]);
  const clamped = Math.min(cursor, Math.max(0, results.length - 1));
  const browsing = query.trim() === "";
  const erroredCount = Object.values(search.perSource).filter((source) => source.error).length;
  const tabSources = activeCategory?.group ? SOURCES.filter((source) => source.group === activeCategory.group) : SOURCES;
  const tabErrored = tabSources.length > 0 && tabSources.every((source) => search.perSource[source.id]?.error);
  const showStats = results.some((result) => result.sizeBytes > 0 || result.seeders > 0);

  useEffect(() => { setCursor(0); }, [results]);
  useEffect(() => {
    if (!focused) return;
    setCaptureMode(mode === "search" ? "text" : mode === "detail" ? "esc" : "none");
    return () => setCaptureMode("none");
  }, [focused, mode, setCaptureMode]);
  useEffect(() => { if (!focused) setMode("list"); }, [focused]);
  useEffect(() => {
    const row = selectedRow.current;
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [clamped]);
  useEffect(() => {
    if (!focused || mode !== "list") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || event.isComposing) return;
      if (event.key === "/") { event.preventDefault(); setMode("search"); return; }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        if (results.length > 0 && clamped > 0) setCursor(clamped - 1);
        else setMode("search");
        return;
      }
      if (results.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); setCursor(wrapStep(clamped, 1, results.length)); }
      else if (event.key === "PageUp") { event.preventDefault(); setCursor(Math.max(0, clamped - 8)); }
      else if (event.key === "PageDown") { event.preventDefault(); setCursor(Math.min(results.length - 1, clamped + 8)); }
      else if (event.key === "Enter") { event.preventDefault(); const result = results[clamped]; if (result) { setDetail(result); setMode("detail"); } }
      else if (event.key === "d") { const result = results[clamped]; if (result) startDownload({ id: result.infoHash, name: result.name, magnet: result.magnet, source: result.source, sizeBytes: result.sizeBytes, seeders: result.seeders }); }
      else if (event.key === "y") { const result = results[clamped]; if (result) copyMagnet({ name: result.name, magnet: result.magnet }); }
      else if (event.key === "s") { event.preventDefault(); setSort((current) => nextSort(current)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clamped, copyMagnet, focused, mode, results, startDownload]);
  useEffect(() => {
    if (!focused || mode !== "detail") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); setMode("list"); setDetail(null); }
      else if (event.key === "d" && detail) startDownload({ id: detail.infoHash, name: detail.name, magnet: detail.magnet, source: detail.source, sizeBytes: detail.sizeBytes, seeders: detail.seeders });
      else if (event.key === "y" && detail) copyMagnet({ name: detail.name, magnet: detail.magnet });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyMagnet, detail, focused, mode, startDownload]);

  const outageCodes = (sources: readonly Source[]): string => {
    const codes = [...new Set(sources.map((source) => search.perSource[source.id]?.code).filter(Boolean))];
    return codes.length ? ` (${codes.join(", ")})` : "";
  };
  const status = (): ReactNode => {
    const sortNote = sort === "none" ? "" : `  ${ICON.dot} sort: ${sortLabel(sort)}`;
    if (search.loading) return results.length > 0 ? <span className="dim">{`searching… ${search.done}/${search.total} sources${sortNote}`}</span> : <Spinner label={`${browsing ? "Loading" : "Searching"} ${search.done}/${search.total} sources`} />;
    if (results.length === 0) {
      if (erroredCount >= search.total) return <span className="warn">{`Couldn't reach any source. They may be down${outageCodes(SOURCES)}.`}</span>;
      if (tabErrored && activeCategory) {
        const down = tabSources.filter((source) => search.perSource[source.id]?.error);
        return <span className="warn">{`Couldn't reach ${activeCategory.label}. ${down.length === 1 ? "The source" : `All ${down.length} sources`} may be down${outageCodes(down)}.`}</span>;
      }
      if (search.results.length > 0 && activeCategory?.group) return <span className="dim">{`No ${activeCategory.label.toLowerCase()} results yet. Try another tab or a search.`}</span>;
      return <span className="dim">{browsing ? "Nothing new right now." : `No results for "${truncate(query, 28)}".`}</span>;
    }
    const notice = erroredCount > 0 ? `  (${erroredCount} source${erroredCount === 1 ? "" : "s"} down)` : "";
    return <span className="dim">{`${browsing ? "newest across all sources" : `${results.length} result${results.length === 1 ? "" : "s"}`}${notice}${sortNote}`}</span>;
  };
  const sortMark = (field: SortField, label: string): ReactNode => sort === "none" || sort.field !== field ? label : <><span className="accent b">{sortArrow(sort.dir)}</span>{label}</>;
  const sortHeader = (field: SortField, label: string): ReactNode => (
    <button className="sort-button" onClick={() => setSort((current) => toggleSort(current, field))} type="button">
      {sortMark(field, label)}
    </button>
  );
  const openDetail = (result: TorrentResult): void => { setDetail(result); setMode("detail"); };
  const closeDetail = (): void => { setMode("list"); setDetail(null); };
  const download = (result: TorrentResult): void => startDownload({ id: result.infoHash, name: result.name, magnet: result.magnet, source: result.source, sizeBytes: result.sizeBytes, seeders: result.seeders });

  return <div className="col results-view">
    <SearchBar width={WIDTH} value={query} editing={mode === "search"} placeholder={PLACEHOLDER} onSubmit={(value) => { setMode("list"); submitQuery(value); }} onExitDown={() => setMode("list")} onExitLeft={() => setRegion("sidebar")} />
    <FilterChips />
    <div className="mt"><Panel title={mode === "detail" ? "details" : browsing ? "latest" : "results"} width={WIDTH} focused={focused && mode !== "search"} count={mode === "detail" || results.length === 0 ? undefined : `(${results.length})`}>
      {mode === "detail" && detail ? <Detail
        onBack={closeDetail}
        onCopy={() => copyMagnet({ name: detail.name, magnet: detail.magnet })}
        onDownload={() => download(detail)}
        result={detail}
      /> : <>
        <div className="result-status">{status()}</div>
        {results.length > 0 ? <div className={`col result-list ${showStats ? "" : "no-stats"}`}>
          <div className="result-grid result-head dim b"><span /><span>#</span><span>Name</span><span>{showStats ? sortHeader("size", "Size") : "Added"}</span><span>{showStats ? sortHeader("seeders", "Seed:Lch") : ""}</span><span>{sortHeader("source", "Src")}</span></div>
          {results.map((result, index) => {
            const selected = index === clamped;
            const source = sourceStyle(result.source);
            return <div className="col" key={result.infoHash}>
              <button ref={selected ? selectedRow : undefined} className={`result-grid result-row ${selected && focused ? "selected" : ""}`} aria-selected={selected} onClick={() => { if (selected && focused) { openDetail(result); return; } setCursor(index); setRegion("content"); }} onDoubleClick={() => openDetail(result)} type="button">
                <span className="accent">{selected && focused ? ICON.pointer : ""}</span><span className="dim">{index + 1}</span><span className={`trunc ${selected && focused ? "accent b" : "dim"}`}>{cleanText(result.name)}</span><span className="dim">{showStats ? (result.sizeBytes > 0 ? formatBytes(result.sizeBytes) : "-") : (formatRelative(result.added) || "-")}</span><span className={result.seeders > 0 ? "good" : "dim"}>{showStats ? (result.seeders || result.leechers ? `${result.seeders}:${result.leechers}` : "-") : ""}</span><span className={selected && focused ? source.tone : `dim ${source.tone}`}>{source.tag}</span>
              </button>
              {selected && focused ? <RowActions actions={[
                { label: "download", onPress: () => download(result) },
                { label: "copy", onPress: () => copyMagnet({ name: result.name, magnet: result.magnet }) },
                { label: "details", onPress: () => openDetail(result) },
              ]} label="Result actions" /> : null}
            </div>;
          })}
        </div> : null}
      </>}
    </Panel></div>
  </div>;
}
