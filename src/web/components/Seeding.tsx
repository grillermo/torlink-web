import { useEffect, useRef, useState, type RefObject } from "react";
import { cleanText, formatBytes, formatBytesPerSec, truncate } from "../../util/format";
import type { HistoryItem } from "../../download/history";
import type { SeedItem } from "../../download/types";
import { isPlainShortcut } from "../keyboard";
import { wrapStep } from "../move";
import { ICON } from "../theme";
import { useStore } from "../store";
import { Panel } from "./Panel";

const WIDTH = 80;

function sourceStyle(source: HistoryItem["source"]): { tag: string; tone: string } {
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

function glyph(seed: SeedItem | undefined): { icon: string; tone: string } {
  if (!seed) return { icon: ICON.done, tone: "good" };
  if (seed.status === "seeding") return { icon: ICON.up, tone: "good" };
  if (seed.status === "paused") return { icon: ICON.pause, tone: "dim" };
  return { icon: ICON.warn, tone: "warn" };
}

function statusCell(seed: SeedItem | undefined): { text: string; tone: string } {
  if (!seed) return { text: "ready", tone: "dim" };
  if (seed.status === "seeding") return { text: `${ICON.up}${formatBytesPerSec(seed.uploadSpeed) || "0 B/s"} ${ICON.peer}${seed.peers}`, tone: "good" };
  if (seed.status === "paused") return { text: "paused", tone: "dim" };
  return { text: "file gone", tone: "warn" };
}

export function Seeding() {
  const { state, region, setRegion, setNotice, setSeedFocus, toggleSeed, removeHistory } = useStore();
  const history = state.history;
  const seeds = new Map(state.seeds.map((seed) => [seed.id, seed]));
  const total = history.length;
  const [cursor, setCursor] = useState(0);
  const selectedRow = useRef<HTMLButtonElement>(null);
  const focused = region === "content";
  const clamped = Math.min(cursor, Math.max(0, total - 1));
  const selected = history[clamped];
  const selectedSeed = selected ? seeds.get(selected.id) : undefined;

  useEffect(() => {
    setSeedFocus(focused && total > 0 ? (selectedSeed?.status ?? "idle") : null);
    return () => setSeedFocus(null);
  }, [focused, selectedSeed?.status, setSeedFocus, total]);

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
      const item = history[clamped];
      if (!item) return;
      if (event.key === "p") {
        const seed = seeds.get(item.id);
        toggleSeed?.(item.id, seed?.status === "seeding" ? "pause" : "resume");
        if (seed?.status === "missing") setNotice(`${ICON.warn} That file isn't on disk anymore.`);
      } else if (event.key === "c") removeHistory(item.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clamped, focused, history, removeHistory, seeds, setNotice, toggleSeed, total]);

  const seeding = state.seeds.filter((seed) => seed.status === "seeding");
  const totalUp = seeding.reduce((sum, seed) => sum + seed.uploadSpeed, 0);
  const totalPeers = seeding.reduce((sum, seed) => sum + seed.peers, 0);
  const totalShared = state.seeds.reduce((sum, seed) => sum + seed.uploaded, 0);

  const select = (index: number): void => { setCursor(index); setRegion("content"); };

  return <div className="col seeding-view">
    <Panel title="seeding" width={WIDTH} focused={focused} count={seeding.length ? `(${seeding.length})` : undefined}>
      {total === 0 ? <span className="dim">Nothing here yet. Downloads start seeding automatically when they finish, and show up here.</span> : <>
        {seeding.length > 0
          ? <span className="good">{ICON.up} {formatBytesPerSec(totalUp) || "0 B/s"}<span className="dim">{`  ${ICON.dot}  ${totalPeers} peers  ${ICON.dot}  ${formatBytes(totalShared)} shared back`}</span></span>
          : <span className="dim">Downloads seed automatically when they finish. Press p to pause or resume any of them.</span>}
        <div className="col seeding-list">
          <div className="seeding-grid seeding-head dim b"><span /><span /><span>Name</span><span>Size</span><span>Status</span><span>Src</span></div>
          {history.map((item, index) => <SeedRow key={item.id} item={item} seed={seeds.get(item.id)} selected={index === clamped} focused={focused} rowRef={index === clamped ? selectedRow : undefined} onSelect={() => select(index)} />)}
        </div>
      </>}
    </Panel>
  </div>;
}

function SeedRow({ item, seed, selected, focused, rowRef, onSelect }: { item: HistoryItem; seed: SeedItem | undefined; selected: boolean; focused: boolean; rowRef?: RefObject<HTMLButtonElement | null>; onSelect(): void }) {
  const status = statusCell(seed);
  const source = sourceStyle(item.source);
  const mark = selected && focused;
  const icon = glyph(seed);
  return <button ref={rowRef} className={`seeding-grid seeding-row ${mark ? "selected" : ""}`} aria-selected={selected} onClick={onSelect} type="button">
    <span className="accent">{mark ? ICON.pointer : ""}</span><span className={icon.tone}>{icon.icon}</span><span className={`trunc ${mark ? "accent b" : "dim"}`}>{cleanText(item.name)}</span><span className="dim">{item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : "-"}</span><span className={`${status.tone} trunc`}>{truncate(status.text, 14)}</span><span className={mark ? source.tone : `dim ${source.tone}`}>{source.tag}</span>
  </button>;
}
