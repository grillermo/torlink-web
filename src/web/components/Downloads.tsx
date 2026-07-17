import { useEffect, useRef, useState, type RefObject } from "react";
import { cleanText, formatBytes, formatBytesPerSec, formatEtaShort, formatRelative, truncate } from "../../util/format";
import type { QueueItem } from "../../download/types";
import type { HistoryItem } from "../../download/history";
import { ICON } from "../theme";
import { isPlainShortcut } from "../keyboard";
import { wrapStep } from "../move";
import { useStore } from "../store";
import { Panel } from "./Panel";
import { ProgressBar } from "./ProgressBar";
import { RowActions, type RowAction } from "./RowActions";

const WIDTH = 80;

function sourceStyle(source: QueueItem["source"]): { tag: string; tone: string } {
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
    default: return { tag: "mag", tone: "dim" };
  }
}

function statusIcon(status: QueueItem["status"]): string {
  if (status === "failed") return ICON.error;
  if (status === "paused") return ICON.pause;
  return ICON.down;
}

function rightStats(item: QueueItem): string {
  if (item.status === "downloading") {
    const eta = item.eta ? `  ${formatEtaShort(item.eta)}` : "";
    return `${item.progress}%  ${formatBytesPerSec(item.speed) || "…"}  ${ICON.peer}${item.peers}${eta}`;
  }
  if (item.status === "paused") return `paused  ${item.progress}%`;
  return truncate(item.error || "failed", 28);
}

function focusFor(item: QueueItem | undefined): "downloading" | "paused" | "failed" | null {
  if (item?.status === "downloading" || item?.status === "paused" || item?.status === "failed") return item.status;
  return null;
}

export function Downloads() {
  const { state, region, setRegion, setDownloadFocus, startDownload, cancelDownload, toggleDownload, retryFailed, removeHistory, clearHistory, showError } = useStore();
  const active = state.queue;
  const recent = state.history;
  const total = active.length + recent.length;
  const [cursor, setCursor] = useState(0);
  const selectedRow = useRef<HTMLButtonElement>(null);
  const focused = region === "content";
  const clamped = Math.min(cursor, Math.max(0, total - 1));
  const inActive = clamped < active.length;
  const activeItem = inActive ? active[clamped] : undefined;
  const recentItem = !inActive ? recent[clamped - active.length] : undefined;

  useEffect(() => {
    if (!focused || total === 0) {
      setDownloadFocus(null);
      return;
    }
    setDownloadFocus(inActive ? focusFor(activeItem) : "recent");
    return () => setDownloadFocus(null);
  }, [activeItem?.status, focused, inActive, setDownloadFocus, total]);

  useEffect(() => {
    const row = selectedRow.current;
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [clamped]);

  useEffect(() => {
    if (!focused || total === 0) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || event.isComposing) return;
      if (!isPlainShortcut(event)) return;
      if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); setCursor(wrapStep(clamped, -1, total)); return; }
      if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); setCursor(wrapStep(clamped, 1, total)); return; }
      if (event.key === "f") { retryFailed(); return; }
      if (event.key === "x") { clearHistory(); return; }
      if (activeItem) {
        if (event.key === "c") cancelDownload(activeItem.id);
        else if (event.key === "p") toggleDownload(activeItem.id, activeItem.status === "paused" ? "resume" : "pause");
        else if (event.key === "Enter" && activeItem.status === "failed") { event.preventDefault(); showError(activeItem); }
      } else if (recentItem) {
        if (event.key === "Enter" || event.key === "d") startDownload({ id: recentItem.id, name: recentItem.name, magnet: recentItem.magnet, source: recentItem.source, sizeBytes: recentItem.sizeBytes });
        else if (event.key === "c") removeHistory(recentItem.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, cancelDownload, clamped, clearHistory, focused, recentItem, removeHistory, retryFailed, showError, startDownload, toggleDownload, total]);

  const select = (index: number): void => { setCursor(index); setRegion("content"); };
  const enterActive = (item: QueueItem): void => {
    if (item.status === "failed") showError(item);
  };
  const enterRecent = (item: HistoryItem): void => {
    startDownload({ id: item.id, name: item.name, magnet: item.magnet, source: item.source, sizeBytes: item.sizeBytes });
  };
  const activeActions = (item: QueueItem): RowAction[] => item.status === "failed"
    ? [
        { label: "error", onPress: () => showError(item) },
        { label: "retry", onPress: retryFailed },
        { label: "remove", tone: "bad", onPress: () => cancelDownload(item.id) },
      ]
    : [
        { label: item.status === "paused" ? "resume" : "pause", onPress: () => toggleDownload(item.id, item.status === "paused" ? "resume" : "pause") },
        { label: "cancel", tone: "bad", onPress: () => cancelDownload(item.id) },
      ];
  const recentActions = (item: HistoryItem): RowAction[] => [
    { label: "download again", onPress: () => enterRecent(item) },
    { label: "remove", tone: "bad", onPress: () => removeHistory(item.id) },
  ];

  return <div className="col downloads-view">
    <Panel title="downloads" width={WIDTH} focused={focused} count={active.length ? `(${active.length})` : undefined}>
      {total === 0 ? <span className="dim">No downloads yet. Find something and press d to grab it.</span> : <div className="col downloads-list">
        {active.map((item, index) => {
          const selected = index === clamped;
          return <div className="col" key={item.id}>
            <ActiveRow item={item} selected={selected} focused={focused} rowRef={selected ? selectedRow : undefined} onSelect={() => select(index)} onEnter={enterActive} />
            {selected && focused ? <RowActions actions={activeActions(item)} label="Download actions" /> : null}
          </div>;
        })}
        {recent.length ? <span className="row recent-title-row">
          <span className="dim">{`Recently downloaded${recent.length > 1 ? `  (${recent.length})` : ""}`}</span>
          <button className="ghost-button" onClick={clearHistory} type="button">clear all</button>
        </span> : null}
        {recent.map((item, index) => {
          const selected = active.length + index === clamped;
          return <div className="col" key={item.id}>
            <RecentRow item={item} selected={selected} focused={focused} rowRef={selected ? selectedRow : undefined} onSelect={() => select(active.length + index)} onEnter={enterRecent} />
            {selected && focused ? <RowActions actions={recentActions(item)} label="Recent download actions" /> : null}
          </div>;
        })}
      </div>}
    </Panel>
  </div>;
}

function ActiveRow({ item, selected, focused, rowRef, onSelect, onEnter }: { item: QueueItem; selected: boolean; focused: boolean; rowRef?: RefObject<HTMLButtonElement | null>; onSelect(): void; onEnter(item: QueueItem): void }) {
  const source = sourceStyle(item.source);
  const tone = item.status === "failed" ? "bad" : item.status === "paused" ? "dim" : "accent";
  return <button ref={rowRef} className={`download-row ${selected && focused ? "selected" : ""} ${item.status === "paused" ? "download-paused" : ""}`} aria-selected={selected} onClick={onSelect} onDoubleClick={() => onEnter(item)} type="button">
    <span className="accent">{selected && focused ? ICON.pointer : ""}</span><span className={tone}>{statusIcon(item.status)}</span><span className={`trunc ${selected && focused ? "accent b" : "dim"}`}>{cleanText(item.name)}</span><span className="dim">{item.totalBytes > 0 ? formatBytes(item.totalBytes) : "-"}</span><span className={selected && focused ? source.tone : `dim ${source.tone}`}>{source.tag}</span>
    <span className="download-progress"><ProgressBar pct={item.progress} width={24} animate={item.status === "downloading"} /></span><span className="dim trunc">{rightStats(item)}</span>
  </button>;
}

function RecentRow({ item, selected, focused, rowRef, onSelect, onEnter }: { item: HistoryItem; selected: boolean; focused: boolean; rowRef?: RefObject<HTMLButtonElement | null>; onSelect(): void; onEnter(item: HistoryItem): void }) {
  const source = sourceStyle(item.source);
  return <button ref={rowRef} className={`download-row download-recent-row ${selected && focused ? "selected" : ""}`} aria-selected={selected} onClick={onSelect} onDoubleClick={() => onEnter(item)} type="button">
    <span className="accent">{selected && focused ? ICON.pointer : ""}</span><span className="good">{ICON.done}</span><span className={`trunc ${selected && focused ? "accent b" : "dim"}`}>{cleanText(item.name)}</span><span className="dim">{item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : "-"}</span><span className="dim">{formatRelative(item.completedAt / 1000) || "-"}</span><span className={selected && focused ? source.tone : `dim ${source.tone}`}>{source.tag}</span>
  </button>;
}
