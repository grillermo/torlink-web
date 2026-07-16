import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout, useStdin } from "ink";
import { promises as fs } from "node:fs";
import { loadConfig, saveConfig, normalizeDirList, type Config } from "../config/config";
import { normalizeDownloadDir } from "../config/folder";
import { DownloadQueue } from "../download/queue";
import { loadQueue, loadSeeds } from "../download/persist";
import { loadHistory } from "../download/history";
import { reconcileQueue } from "../download/reconcile";
import { parseMagnet } from "../sources/magnet";
import { magnetFromTorrentFile } from "../sources/torrentFile";
import { readClipboard, writeClipboard } from "../util/clipboard";
import { cleanText, truncate } from "../util/format";
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
import { Logo } from "./components/Logo";
import { Sidebar, RAIL_WIDTH } from "./components/Sidebar";
import { Rule } from "./components/Rule";
import { Footer } from "./components/Footer";
import { HelpOverlay } from "./components/HelpOverlay";
import { ErrorDetail } from "./components/ErrorDetail";
import { Results } from "./components/Results";
import { Downloads } from "./components/Downloads";
import { Seeding } from "./components/Seeding";
import { Spinner } from "./components/Spinner";
import { TabTitle } from "./components/TabTitle";
import { Splash } from "./views/Splash";
import { FolderPrompt } from "./components/FolderPrompt";
import { TrackersPrompt } from "./components/TrackersPrompt";
import { ThrottlePrompt, type ThrottleDirection } from "./components/ThrottlePrompt";
import { footerHints } from "./keymap";
import { COLOR, ICON } from "./theme";
import { useMouseWheel } from "./hooks/useMouseWheel";
import type { SourceId } from "../sources/types";
import type { QueueItem } from "../download/types";

export function App({
  initialMagnet,
  initialTorrent,
  onQuit,
}: { initialMagnet?: string; initialTorrent?: string; onQuit?: () => void } = {}) {
  useMouseWheel();
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { stdout } = useStdout();

  const [size, setSize] = useState({
    rows: stdout?.rows ?? 24,
    cols: stdout?.columns ?? 80,
  });
  useEffect(() => {
    if (!stdout) return;
    let last = { rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 };
    const onResize = (): void => {
      const next = { rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 };
      if (next.rows === last.rows && next.cols === last.cols) return;
      if (next.rows < last.rows || next.cols < last.cols) {
        stdout.write("\x1b[2J\x1b[H");
      }
      last = next;
      setSize(next);
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const rows = size.rows;
  const cols = size.cols;

  const [queue, setQueue] = useState<DownloadQueue | null>(null);
  const [config, setConfigState] = useState<Config | null>(null);
  const [view, setView] = useState<View>("splash");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [region, setRegion] = useState<Region>("content");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("none");
  const [downloadFocus, setDownloadFocus] = useState<DownloadFocus | null>(null);
  const [seedFocus, setSeedFocus] = useState<SeedFocus | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [editingTrackers, setEditingTrackers] = useState(false);
  const [throttleField, setThrottleField] = useState<ThrottleDirection | null>(null);
  const editingThrottle = throttleField !== null;
  const [notice, setNotice] = useState<string | null>(null);
  const [errorItem, setErrorItem] = useState<QueueItem | null>(null);
  const booting = useRef(false);

  useEffect(() => {
    if (booting.current) return;
    booting.current = true;
    let alive = true;
    void (async () => {
      const cfg = await loadConfig();
      const q = new DownloadQueue();
      q.setTrackers(cfg.trackers);
      q.restore(reconcileQueue(await loadQueue()));
      q.restoreHistory(await loadHistory());
      q.restoreSeeds(await loadSeeds());
      if (!alive) {
        q.suspend();
        return;
      }
      q.setThrottle(cfg.maxDownloadKbps, cfg.maxUploadKbps);
      setConfigState(cfg);
      setQueue(q);
      const launch = initialMagnet
        ? parseMagnet(initialMagnet)
        : initialTorrent
          ? await magnetFromTorrentFile(initialTorrent)
          : null;
      if (launch) {
        await fs.mkdir(cfg.downloadDir, { recursive: true }).catch(() => {});
        q.add(
          { id: launch.infoHash, name: launch.name, magnet: launch.magnet },
          cfg.downloadDir,
        );
        setView("browser");
        setSection("downloads");
        setRegion("content");
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialMagnet, initialTorrent]);

  useEffect(() => {
    if (!queue) return;
    const onCompleted = (name: string): void =>
      setNotice(`${ICON.done} ${truncate(cleanText(name), 40)}`);
    queue.on("completed", onCompleted);
    return () => {
      queue.off("completed", onCompleted);
    };
  }, [queue]);

  useEffect(
    () => () => {
      queue?.suspend();
    },
    [queue],
  );

  const quitAll = useCallback(() => {
    // Flush all state synchronously up front so nothing is lost to the hard
    // exit; the unmount effect still runs suspend() for the engine teardown.
    queue?.persistSync();
    if (onQuit) onQuit();
    else exit();
  }, [queue, onQuit, exit]);

  const setConfig = useCallback(
    (c: Config) => {
      setConfigState(c);
      queue?.setTrackers(c.trackers);
      void saveConfig(c);
    },
    [queue],
  );

  const closeFolderPrompt = useCallback(() => {
    setEditingFolder(false);
  }, []);

  const closeTrackersPrompt = useCallback(() => {
    setEditingTrackers(false);
  }, []);

  const setTrackers = useCallback(
    (list: string[]) => {
      closeTrackersPrompt();
      if (!config) return;
      const same =
        list.length === config.trackers.length &&
        list.every((t, i) => t === config.trackers[i]);
      if (same) {
        setNotice("Trackers unchanged.");
        return;
      }
      setConfig({ ...config, trackers: list });
      setNotice(list.length === 0 ? "Cleared extra trackers." : `Saved ${list.length} tracker${list.length === 1 ? "" : "s"}.`);
    },
    [config, setConfig, closeTrackersPrompt],
  );

  const closeThrottlePrompt = useCallback(() => {
    setThrottleField(null);
  }, []);

  const submitThrottle = useCallback(
    (raw: string) => {
      const field = throttleField;
      closeThrottlePrompt();
      if (!config || !field) return;
      // Blank or unparseable means "no cap" (0); config sanitizing floors/clamps.
      const n = Number.parseInt(raw.trim(), 10);
      const kbps = Number.isFinite(n) && n > 0 ? n : 0;
      const key = field === "download" ? "maxDownloadKbps" : "maxUploadKbps";
      const arrow = field === "download" ? "↓" : "↑";
      if (kbps === config[key]) {
        setNotice(`${arrow} throttle unchanged.`);
        return;
      }
      const next = { ...config, [key]: kbps };
      setConfig(next);
      queue?.setThrottle(next.maxDownloadKbps, next.maxUploadKbps);
      const label = kbps > 0 ? `${kbps} KB/s` : "unlimited";
      setNotice(`Throttle: ${arrow} ${label}`);
    },
    [config, queue, setConfig, closeThrottlePrompt, throttleField],
  );

  const setDownloadDir = useCallback(
    (raw: string) => {
      closeFolderPrompt();
      const dir = normalizeDownloadDir(raw);
      if (!config || !dir || dir === config.downloadDir) {
        if (config && dir && dir === config.downloadDir) setNotice("Download folder unchanged.");
        return;
      }
      void (async () => {
        try {
          await fs.mkdir(dir, { recursive: true });
        } catch {
          setNotice(`Couldn't use folder: ${truncate(dir, 48)}`);
          return;
        }
        setConfig({
          ...config,
          downloadDir: dir,
          downloadDirs: normalizeDirList(dir, config.downloadDirs),
        });
        setNotice(`Download folder: ${truncate(dir, 48)}`);
      })();
    },
    [config, setConfig, closeFolderPrompt],
  );

  const addFolder = useCallback(
    (raw: string) => {
      closeFolderPrompt();
      const dir = normalizeDownloadDir(raw);
      if (!config || !dir) return;
      if (config.downloadDirs.includes(dir) && dir === config.downloadDir) {
        setNotice("Download folder unchanged.");
        return;
      }
      void (async () => {
        try {
          await fs.mkdir(dir, { recursive: true });
        } catch {
          setNotice(`Couldn't use folder: ${truncate(dir, 48)}`);
          return;
        }
        setConfig({
          ...config,
          downloadDir: dir,
          downloadDirs: normalizeDirList(dir, config.downloadDirs),
        });
        setNotice(`Download folder: ${truncate(dir, 48)}`);
      })();
    },
    [config, setConfig, closeFolderPrompt],
  );

  const removeFolder = useCallback(
    (dir: string) => {
      if (!config) return;
      if (dir === config.downloadDir) {
        setNotice("Can't remove the active folder.");
        return;
      }
      const downloadDirs = config.downloadDirs.filter((d) => d !== dir);
      setConfig({ ...config, downloadDirs });
      setNotice(`Removed: ${truncate(dir, 48)}`);
    },
    [config, setConfig],
  );

  const startDownload = useCallback(
    (input: {
      id: string;
      name: string;
      magnet: string;
      source?: SourceId;
      sizeBytes?: number;
    }) => {
      if (!config || !queue) return;
      void fs.mkdir(config.downloadDir, { recursive: true }).catch(() => {});
      queue.add(input, config.downloadDir);
      setNotice(`Added: ${truncate(cleanText(input.name), 40)}`);
      setSection("downloads");
      setRegion("content");
    },
    [config, queue],
  );

  const showError = useCallback((item: QueueItem) => {
    setErrorItem(item);
  }, []);

  const copyMagnet = useCallback((input: { name: string; magnet: string }) => {
    void (async () => {
      const ok = await writeClipboard(input.magnet);
      if (ok) {
        setNotice(`Copied magnet: ${truncate(cleanText(input.magnet), 60)}`);
        return;
      }
      setNotice(`Couldn't copy magnet for ${truncate(cleanText(input.name), 32)}.`);
    })();
  }, []);

  const submitQuery = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (q) {
        const magnet = parseMagnet(q);
        if (magnet) {
          startDownload({
            id: magnet.infoHash,
            name: magnet.name,
            magnet: magnet.magnet,
          });
          setView("browser");
          return;
        }
      }
      setQuery(q);
      setView("browser");
      if (section === "downloads") setSection("all");
      setRegion("content");
    },
    [section, startDownload],
  );

  const pasteFromClipboard = useCallback(async () => {
    const text = (await readClipboard()).trim();
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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const compact = rows < 18;
  const showTopRule = !compact;
  const showFooter = rows >= 12;
  const chrome =
    3 +
    (showTopRule ? 1 : 0) +
    (compact ? 0 : 1) +
    (showFooter ? 1 : 0);
  const bodyH = Math.max(6, rows - 1 - chrome);
  const listRows = Math.max(4, bodyH);
  const contentWidth = Math.max(24, cols - RAIL_WIDTH - 3);
  const ruleWidth = Math.max(10, cols - 2);

  const store: Store | null = useMemo(() => {
    if (!queue || !config) return null;
    return {
      config,
      setConfig,
      queue,
      view,
      setView,
      query,
      submitQuery,
      section,
      setSection,
      region:
        showHelp || editingFolder || editingTrackers || editingThrottle || errorItem
          ? "help"
          : region,
      setRegion,
      captureMode,
      setCaptureMode,
      downloadFocus,
      setDownloadFocus,
      seedFocus,
      setSeedFocus,
      startDownload,
      copyMagnet,
      showError,
      notice,
      setNotice,
      quitAll,
      listRows,
      compact,
      contentWidth,
      cols,
      rows,
    };
  }, [
    queue,
    config,
    view,
    query,
    submitQuery,
    section,
    region,
    showHelp,
    editingFolder,
    editingTrackers,
    editingThrottle,
    errorItem,
    captureMode,
    downloadFocus,
    seedFocus,
    startDownload,
    copyMagnet,
    showError,
    notice,
    listRows,
    compact,
    contentWidth,
    cols,
    rows,
    setConfig,
    quitAll,
  ]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        quitAll();
        return;
      }
      if (editingFolder || editingTrackers || editingThrottle) return; // the prompt owns input (its own esc + enter)
      if (captureMode === "text") return;
      if (errorItem) {
        setErrorItem(null);
        return;
      }
      if (showHelp) {
        setShowHelp(false);
        return;
      }
      if (input === "?") {
        setShowHelp(true);
        return;
      }
      if (input === "o") {
        setShowHelp(false);
        setEditingFolder(true);
        return;
      }
      if (input === "t") {
        setShowHelp(false);
        setEditingTrackers(true);
        return;
      }
      if (input === "r") {
        setShowHelp(false);
        setThrottleField("download");
        return;
      }
      if (input === "u") {
        setShowHelp(false);
        setThrottleField("upload");
        return;
      }
      if (input === "m") {
        void pasteFromClipboard();
        return;
      }
      if (key.tab) {
        setRegion(region === "sidebar" ? "content" : "sidebar");
        return;
      }
      if (key.rightArrow || input === "l") {
        if (region === "sidebar") setRegion("content");
        return;
      }
      if (key.leftArrow || input === "h") {
        if (region === "content") setRegion("sidebar");
        return;
      }
      if (key.escape) {
        if (captureMode === "esc") return;
        if (region === "content") {
          setRegion("sidebar");
          return;
        }
        setView("splash");
        return;
      }
      if (input === "q") {
        quitAll();
        return;
      }
    },
    { isActive: isRawModeSupported && view === "browser" && !!store },
  );

  if (!store) {
    return (
      <Box height={rows} justifyContent="center" alignItems="center">
        <Spinner label="Starting torlink" />
      </Box>
    );
  }

  if (view === "splash") {
    return (
      <StoreContext.Provider value={store}>
        <TabTitle />
        <Splash />
      </StoreContext.Provider>
    );
  }

  const throttleValue =
    throttleField === "upload" ? store.config.maxUploadKbps : store.config.maxDownloadKbps;

  return (
    <StoreContext.Provider value={store}>
      <TabTitle />
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Logo />
          {notice ? <Text color={COLOR.good}>{notice}</Text> : null}
        </Box>
        {showTopRule ? <Rule width={ruleWidth} /> : null}

        {showHelp ? (
          <Box marginTop={1}>
            <HelpOverlay />
          </Box>
        ) : null}

        {editingFolder ? (
          <Box marginTop={1}>
            <FolderPrompt
              width={Math.max(24, Math.min(cols - 4, 62))}
              dirs={store.config.downloadDirs}
              active={store.config.downloadDir}
              onActivate={setDownloadDir}
              onAdd={addFolder}
              onRemove={removeFolder}
              onCancel={closeFolderPrompt}
            />
          </Box>
        ) : null}

        {editingTrackers ? (
          <Box marginTop={1}>
            <TrackersPrompt
              width={Math.max(24, Math.min(cols - 4, 78))}
              value={store.config.trackers}
              onSubmit={setTrackers}
              onCancel={closeTrackersPrompt}
            />
          </Box>
        ) : null}

        {throttleField ? (
          <Box marginTop={1}>
            <ThrottlePrompt
              width={Math.max(24, Math.min(cols - 4, 62))}
              direction={throttleField}
              value={throttleValue > 0 ? String(throttleValue) : ""}
              onSubmit={submitThrottle}
              onCancel={closeThrottlePrompt}
            />
          </Box>
        ) : null}

        {errorItem ? (
          <Box marginTop={1}>
            <ErrorDetail item={errorItem} />
          </Box>
        ) : null}

        <Box
          height={bodyH}
          marginTop={compact ? 0 : 1}
          display={
            showHelp || editingFolder || editingTrackers || editingThrottle || errorItem
              ? "none"
              : "flex"
          }
          overflow="hidden"
        >
          <Sidebar />
          <Box flexGrow={1} flexDirection="column">
            {section === "downloads" ? (
              <Downloads />
            ) : section === "seeding" ? (
              <Seeding />
            ) : (
              <Results />
            )}
          </Box>
        </Box>

        {showFooter ? (
          <Box
            display={
              showHelp || editingFolder || editingTrackers || editingThrottle || errorItem
                ? "none"
                : "flex"
            }
          >
            <Footer hints={footerHints(region, section, downloadFocus, seedFocus)} />
          </Box>
        ) : null}
      </Box>
    </StoreContext.Provider>
  );
}
