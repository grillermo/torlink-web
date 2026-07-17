import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { QueueItem } from "../download/types";
import { parseMagnet } from "../sources/magnet";
import type { SourceId } from "../sources/types";
import { cleanText, truncate } from "../util/format";
import { footerHints } from "./keymap";
import { post, type ActionResponse } from "./api";
import { Footer } from "./components/Footer";
import { Downloads } from "./components/Downloads";
import { Seeding } from "./components/Seeding";
import { ErrorDetail } from "./components/ErrorDetail";
import { FolderPrompt } from "./components/FolderPrompt";
import { HelpOverlay } from "./components/HelpOverlay";
import { Logo } from "./components/Logo";
import { Rule } from "./components/Rule";
import { Results } from "./components/Results";
import { SettingsSheet, type SettingsTarget } from "./components/SettingsSheet";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { TabTitle } from "./components/TabTitle";
import { ThrottlePrompt } from "./components/ThrottlePrompt";
import { TrackersPrompt } from "./components/TrackersPrompt";
import { useServerState } from "./hooks/useServerState";
import { handleGlobalKey } from "./keyboard";
import { Splash } from "./views/Splash";
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

export function App({ children }: { children?: ReactNode } = {}) {
  const { state, completed, completedVersion } = useServerState();
  const [view, setView] = useState<View>("splash");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [region, setRegion] = useState<Region>("content");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("none");
  const [downloadFocus, setDownloadFocus] = useState<DownloadFocus | null>(null);
  const [seedFocus, setSeedFocus] = useState<SeedFocus | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const noticeSequence = useRef(0);
  const [noticeState, setNoticeState] = useState<{ text: string | null; sequence: number }>({
    text: null,
    sequence: 0,
  });
  const [errorItem, setErrorItem] = useState<QueueItem | null>(null);
  const [stopped, setStopped] = useState(false);

  const reserveNotice = useCallback((): number => {
    noticeSequence.current += 1;
    return noticeSequence.current;
  }, []);

  const publishReservedNotice = useCallback((sequence: number, text: string | null): void => {
    if (noticeSequence.current === sequence) setNoticeState({ text, sequence });
  }, []);

  const setNotice = useCallback((text: string | null): void => {
    const sequence = reserveNotice();
    setNoticeState({ text, sequence });
  }, [reserveNotice]);

  useEffect(() => {
    if (completed) setNotice(`✓ ${truncate(cleanText(completed), 40)}`);
  }, [completed, completedVersion, setNotice]);

  useEffect(() => {
    if (!noticeState.text) return;
    const { sequence } = noticeState;
    const timer = window.setTimeout(() => {
      setNoticeState((current) => current.sequence === sequence
        ? { text: null, sequence }
        : current);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [noticeState]);

  const runAction = useCallback(async (path: string, body?: unknown) => {
    const sequence = reserveNotice();
    const result = await post(path, body);
    publishReservedNotice(sequence, responseNotice(result));
    return result;
  }, [publishReservedNotice, reserveNotice]);

  const startDownload = useCallback((input: {
    id: string;
    name: string;
    magnet: string;
    source?: SourceId;
    sizeBytes?: number;
    seeders?: number;
  }) => {
    void runAction("/api/downloads", input);
    setSection("downloads");
    setRegion("content");
  }, [runAction]);

  const cancelDownload = useCallback((id: string) => {
    void runAction(`/api/downloads/${encodeURIComponent(id)}/cancel`);
  }, [runAction]);

  const toggleDownload = useCallback((id: string, action: "pause" | "resume") => {
    void runAction(`/api/downloads/${encodeURIComponent(id)}/${action}`);
  }, [runAction]);

  const retryFailed = useCallback(() => {
    for (const item of state?.queue ?? []) {
      if (item.status === "failed") void runAction(`/api/downloads/${encodeURIComponent(item.id)}/retry`);
    }
  }, [runAction, state?.queue]);

  const removeHistory = useCallback((id: string) => {
    void runAction(`/api/history/${encodeURIComponent(id)}/delete`);
  }, [runAction]);

  const clearHistory = useCallback(() => {
    void runAction("/api/history/clear");
  }, [runAction]);

  const toggleSeed = useCallback((id: string, action: "pause" | "resume") => {
    void runAction(`/api/seeds/${encodeURIComponent(id)}/${action}`);
  }, [runAction]);

  const copyMagnet = useCallback((input: { name: string; magnet: string }) => {
    const sequence = reserveNotice();
    void (async () => {
      try {
        const clipboard = navigator.clipboard;
        if (typeof clipboard?.writeText !== "function") throw new Error("clipboard unavailable");
        await clipboard.writeText(input.magnet);
        publishReservedNotice(
          sequence,
          `Copied magnet: ${truncate(cleanText(input.magnet), 60)}`,
        );
      } catch {
        publishReservedNotice(
          sequence,
          `Couldn't copy magnet for ${truncate(cleanText(input.name), 32)}.`,
        );
      }
    })();
  }, [publishReservedNotice, reserveNotice]);

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
    const sequence = reserveNotice();
    let text: string;
    try {
      const clipboard = navigator.clipboard;
      if (typeof clipboard?.readText !== "function") throw new Error("clipboard unavailable");
      text = (await clipboard.readText()).trim();
    } catch {
      publishReservedNotice(sequence, "Clipboard is empty.");
      return;
    }
    if (!text) {
      publishReservedNotice(sequence, "Clipboard is empty.");
      return;
    }
    const found = text.match(/magnet:\?xt=urn:btih:[^\s"'<>]+/i)?.[0];
    const magnet = found ? parseMagnet(found) : null;
    if (magnet) {
      startDownload({ id: magnet.infoHash, name: magnet.name, magnet: magnet.magnet });
      setView("browser");
      return;
    }
    publishReservedNotice(sequence, "No magnet link on the clipboard.");
  }, [publishReservedNotice, reserveNotice, startDownload]);

  const submitFolder = useCallback((action: "use" | "remove", dir: string) => {
    void runAction("/api/config/folder", { action, dir }).then((result) => {
      if (result.ok) setPrompt(null);
    });
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
    const sequence = reserveNotice();
    void post("/api/quit").then((result) => {
      if (result.ok) {
        setStopped(true);
        return;
      }
      publishReservedNotice(sequence, responseNotice(result));
    });
  }, [publishReservedNotice, reserveNotice]);

  useEffect(() => {
    if (!state || view !== "browser") return;
    const onKeyDown = (event: KeyboardEvent): void => handleGlobalKey(event, {
      region,
      setRegion,
      setView,
      captureMode,
      editingPrompt: prompt !== null || settingsOpen,
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
  }, [captureMode, errorItem, pasteFromClipboard, prompt, quitAll, region, settingsOpen, showHelp, state, view]);

  const store = useMemo<Store | null>(() => state ? {
    config: state.config,
    state,
    view,
    setView,
    query,
    submitQuery,
    section,
    setSection,
    region: showHelp || prompt || errorItem || settingsOpen ? "help" : region,
    setRegion,
    captureMode,
    setCaptureMode,
    downloadFocus,
    setDownloadFocus,
    seedFocus,
    setSeedFocus,
    startDownload,
    cancelDownload,
    toggleDownload,
    retryFailed,
    removeHistory,
    clearHistory,
    toggleSeed,
    copyMagnet,
    showError: setErrorItem,
    notice: noticeState.text,
    setNotice,
    quitAll,
  } : null, [
    cancelDownload, captureMode, clearHistory, copyMagnet, downloadFocus, errorItem, noticeState.text,
    prompt, query, quitAll, region, removeHistory, retryFailed, section, seedFocus, settingsOpen,
    showHelp, startDownload, state, submitQuery, toggleDownload, toggleSeed, view,
  ]);

  const openSettings = useCallback((target: SettingsTarget): void => {
    setSettingsOpen(false);
    setPrompt(target);
  }, []);

  if (stopped) {
    return <main className="stopped">torlink stopped — you can close this tab.</main>;
  }

  if (!state || !store) {
    return <main className="splash" aria-live="polite">Starting torlink…</main>;
  }

  if (view === "splash") {
    return (
      <StoreContext.Provider value={store}>
        <main className="splash" data-view="splash"><Splash />{children}</main>
      </StoreContext.Provider>
    );
  }

  const overlay = showHelp ? "help" : prompt ?? (errorItem ? "error" : settingsOpen ? "settings" : null);

  return (
    <StoreContext.Provider value={store}>
      <main className="app-shell" data-view="browser">
        <TabTitle />
        <header className="logo-row">
          <Logo />
          {noticeState.text ? <span className="notice" role="status">{noticeState.text}</span> : null}
        </header>
        <Rule width={80} />
        {overlay ? (
          <section className="overlay-slot" data-overlay={overlay}>
            {errorItem ? <ErrorDetail
              item={errorItem}
              onClose={() => setErrorItem(null)}
              onRetry={() => { retryFailed(); setErrorItem(null); }}
            /> : null}
            {showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}
            {prompt === "folder" ? <FolderPrompt
              active={state.config.downloadDir}
              dirs={state.config.downloadDirs}
              onActivate={(dir) => submitFolder("use", dir)}
              onAdd={(dir) => submitFolder("use", dir)}
              onCancel={() => setPrompt(null)}
              onRemove={(dir) => submitFolder("remove", dir)}
              width={60}
            /> : null}
            {prompt === "trackers" ? <TrackersPrompt
              onCancel={() => setPrompt(null)}
              onSubmit={submitTrackers}
              value={state.config.trackers}
              width={60}
            /> : null}
            {settingsOpen ? <SettingsSheet
              onCancel={() => setSettingsOpen(false)}
              onSelect={openSettings}
            /> : null}
            {prompt === "download" || prompt === "upload" ? <ThrottlePrompt
              direction={prompt}
              onCancel={() => setPrompt(null)}
              onSubmit={(value) => submitThrottle(prompt, value)}
              value={String(prompt === "download" ? state.config.maxDownloadKbps : state.config.maxUploadKbps)}
              width={40}
            /> : null}
          </section>
        ) : null}
        <div className="workbench" hidden={overlay !== null}>
          <aside className="sidebar-slot" data-region="sidebar"><Sidebar /></aside>
          <section className="content-slot" data-region="content" data-section={section}>
            {children ?? (section === "downloads" ? <Downloads /> : section === "seeding" ? <Seeding /> : <Results />)}
          </section>
        </div>
        <footer className="footer-slot" hidden={overlay !== null}>
          <Footer hints={footerHints(region, section, downloadFocus, seedFocus)} />
        </footer>
        <TabBar onOpenSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} />
      </main>
    </StoreContext.Provider>
  );
}
