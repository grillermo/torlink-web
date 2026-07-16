import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueueItem } from "../download/types";
import { parseMagnet } from "../sources/magnet";
import type { SourceId } from "../sources/types";
import { cleanText, truncate } from "../util/format";
import { post, type ActionResponse } from "./api";
import { useServerState } from "./hooks/useServerState";
import { handleGlobalKey } from "./keyboard";
import {
  StoreContext,
  type CaptureMode,
  type DownloadFocus,
  type Region,
  type Section,
  type SeedFocus,
  type Store,
  type View,
} from "./store";

type ThrottleDirection = "download" | "upload";
type Prompt = "folder" | "trackers" | ThrottleDirection;

function responseNotice(result: ActionResponse): string | null {
  return result.notice ?? result.error ?? null;
}

export function App() {
  const { state, completed } = useServerState();
  const [view, setView] = useState<View>("splash");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [region, setRegion] = useState<Region>("content");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("none");
  const [downloadFocus, setDownloadFocus] = useState<DownloadFocus | null>(null);
  const [seedFocus, setSeedFocus] = useState<SeedFocus | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorItem, setErrorItem] = useState<QueueItem | null>(null);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (completed) setNotice(`✓ ${truncate(cleanText(completed), 40)}`);
  }, [completed]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runAction = useCallback(async (path: string, body?: unknown) => {
    const result = await post(path, body);
    setNotice(responseNotice(result));
    return result;
  }, []);

  const startDownload = useCallback((input: {
    id: string;
    name: string;
    magnet: string;
    source?: SourceId;
    sizeBytes?: number;
  }) => {
    void runAction("/api/downloads", input);
    setSection("downloads");
    setRegion("content");
  }, [runAction]);

  const copyMagnet = useCallback((input: { name: string; magnet: string }) => {
    void navigator.clipboard.writeText(input.magnet).then(
      () => setNotice(`Copied magnet: ${truncate(cleanText(input.magnet), 60)}`),
      () => setNotice(`Couldn't copy magnet for ${truncate(cleanText(input.name), 32)}.`),
    );
  }, []);

  const submitQuery = useCallback((raw: string) => {
    const nextQuery = raw.trim();
    if (nextQuery) {
      const magnet = parseMagnet(nextQuery);
      if (magnet) {
        startDownload({ id: magnet.infoHash, name: magnet.name, magnet: magnet.magnet });
        setView("browser");
        return;
      }
    }
    setQuery(nextQuery);
    setView("browser");
    if (section === "downloads") setSection("all");
    setRegion("content");
  }, [section, startDownload]);

  const pasteFromClipboard = useCallback(async () => {
    let text: string;
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      setNotice("Clipboard is empty.");
      return;
    }
    if (!text) {
      setNotice("Clipboard is empty.");
      return;
    }
    const found = text.match(/magnet:\?xt=urn:btih:[^\s"'<>]+/i)?.[0];
    const magnet = found ? parseMagnet(found) : null;
    if (magnet) {
      startDownload({ id: magnet.infoHash, name: magnet.name, magnet: magnet.magnet });
      setView("browser");
      return;
    }
    setNotice("No magnet link on the clipboard.");
  }, [startDownload]);

  const submitFolder = useCallback((action: "use" | "remove", dir: string) => {
    setPrompt(null);
    void runAction("/api/config/folder", { action, dir });
  }, [runAction]);

  const submitTrackers = useCallback((urls: string[]) => {
    setPrompt(null);
    void runAction("/api/config/trackers", { urls });
  }, [runAction]);

  const submitThrottle = useCallback((direction: ThrottleDirection, value: string) => {
    setPrompt(null);
    void runAction("/api/config/throttle", { direction, value });
  }, [runAction]);

  const quitAll = useCallback(() => {
    void post("/api/quit").then((result) => {
      const message = responseNotice(result);
      if (message) setNotice(message);
      setStopped(true);
    });
  }, []);

  useEffect(() => {
    if (!state || view !== "browser") return;
    const onKeyDown = (event: KeyboardEvent): void => handleGlobalKey(event, {
      region,
      setRegion,
      setView,
      captureMode,
      editingPrompt: prompt !== null,
      errorItem,
      clearErrorItem: () => setErrorItem(null),
      showHelp,
      setShowHelp,
      openFolder: () => setPrompt("folder"),
      openTrackers: () => setPrompt("trackers"),
      openThrottle: setPrompt,
      pasteMagnet: () => { void pasteFromClipboard(); },
      quitAll,
    });
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureMode, errorItem, pasteFromClipboard, prompt, quitAll, region, showHelp, state, view]);

  const store = useMemo<Store | null>(() => state ? {
    config: state.config,
    state,
    view,
    setView,
    query,
    submitQuery,
    section,
    setSection,
    region: showHelp || prompt || errorItem ? "help" : region,
    setRegion,
    captureMode,
    setCaptureMode,
    downloadFocus,
    setDownloadFocus,
    seedFocus,
    setSeedFocus,
    startDownload,
    copyMagnet,
    showError: setErrorItem,
    notice,
    setNotice,
    quitAll,
  } : null, [
    captureMode, copyMagnet, downloadFocus, errorItem, notice, prompt, query, quitAll,
    region, section, seedFocus, showHelp, startDownload, state, submitQuery, view,
  ]);

  if (stopped) {
    return <main className="stopped">torlink stopped — you can close this tab.</main>;
  }

  if (!store) {
    return <main className="splash" aria-live="polite">Starting torlink…</main>;
  }

  if (view === "splash") {
    return (
      <StoreContext.Provider value={store}>
        <main className="splash" data-view="splash">torlink</main>
      </StoreContext.Provider>
    );
  }

  const overlay = showHelp ? "help" : prompt ?? (errorItem ? "error" : null);

  return (
    <StoreContext.Provider value={store}>
      <main className="app-shell" data-view="browser">
        <header className="logo-row">
          <span>torlink</span>
          {notice ? <span className="notice" role="status">{notice}</span> : null}
        </header>
        <div className="rule" />
        {overlay ? <section className="overlay-slot" data-overlay={overlay} /> : null}
        <div className="workbench" hidden={overlay !== null}>
          <aside className="sidebar-slot" data-region="sidebar" />
          <section className="content-slot" data-region="content" data-section={section} />
        </div>
        <footer className="footer-slot" hidden={overlay !== null} />
      </main>
    </StoreContext.Provider>
  );
}
