# torlink web UI rewrite — design

**Date:** 2026-07-16
**Goal:** Replace the Ink TUI with a browser UI. No new features — as close a rewrite as possible. Everything the TUI does, the web UI does; nothing more.

## Decisions (agreed)

- **Deployment:** local server + browser UI. `npx torlnk` starts an HTTP server on `127.0.0.1` and opens the browser. Core code (sources, WebTorrent engine, config, queue) is unchanged; only the UI layer is swapped.
- **TUI:** deleted, fully replaced.
- **Interaction:** keyboard and mouse both. The full TUI keymap works in the browser; rows and buttons are also clickable.
- **Look:** terminal aesthetic — monospace, dark, TUI palette, same layout (sidebar, panels, footer hints).
- **Frontend stack:** React + Vite SPA. Components ported 1:1 from Ink to DOM.
- **Transport:** HTTP POST for actions, SSE for live state. No WebSocket.
- **Security:** bind `127.0.0.1` only, random free port, per-run random auth token required on every request (embedded in the opened URL).
- **Preview SVGs:** `scripts/render-previews*` and `preview/` are dropped. README screenshots are a manual follow-up, out of scope.

## Architecture & lifecycle

```
npx torlnk
  └─ src/index.ts (no JSX)
       ├─ parse CLI args (unchanged: magnet / torrent file / help / version)
       ├─ wire core: loadConfig → DownloadQueue → reconcile   (same wiring App.tsx does today)
       ├─ start HTTP server on 127.0.0.1, random free port
       ├─ print URL + open browser
       └─ Ctrl+C / SIGTERM → persistSync + clean exit (same guarantees as forceExit today)
```

- New `src/server/` — owns config, queue, sources. Single process, single engine. The browser is a thin view.
- New `src/web/` — the React SPA.
- `src/ui/` (Ink) is deleted. `src/download/`, `src/sources/`, `src/config/`, `src/util/`, `src/cli/` are untouched.
- Server framework: **plain `node:http`**. Routes are JSON GET/POST, two SSE endpoints, and static file serving. Matches the project's minimal-dependency ethos.
- A CLI magnet/torrent argument is added to the queue at startup before the browser opens — user-visible behavior unchanged.
- Closing the browser tab does not quit. The server runs until Ctrl+C or the web UI's quit action (`q` → `POST /api/quit` → graceful shutdown).
- Opening the browser: platform-specific `child_process` spawn (`open` / `start` / `xdg-open`), no new dependency. URL is always printed so a failed auto-open is recoverable.

## Server API

All routes require the per-run token (query param or header); requests without it get 401.

### State stream — `GET /api/events` (SSE)

Server pushes a **full snapshot** `{queue, seeds, history, config, activeFolder}`:
- on any queue/config event, and
- as throttled progress ticks (~500 ms, the cadence the TUI uses today).

Snapshots, not diffs — state is small, and reconnect (EventSource auto-reconnects) resyncs instantly for free.

### Search — `GET /api/search?q=&category=` (SSE)

One SSE stream per search. Emits one event per source as each answers — `{sourceId, items}` or `{sourceId, error}` — then a `done` event and closes. Empty `q` = curated browse, same as the TUI. Results carry magnets, so "copy magnet" (`y`) is client-side `navigator.clipboard` — no endpoint.

### Actions (POST, JSON in/out)

| Route | TUI key it replaces |
|---|---|
| `/api/downloads` `{magnet}` | `d` on a result, `m` paste, CLI arg |
| `/api/downloads/:id/pause` `/resume` `/cancel` `/retry` | `p` `c` `f` |
| `/api/history/:id/delete`, `/api/history/clear` | `c` `x` in recent |
| `/api/seeds/:key/pause` `/resume` `/remove` | `p` `c` in seeding |
| `/api/config/throttle` `{downKbps?, upKbps?}` | `r` `u` |
| `/api/config/trackers` `{urls}` | `t` |
| `/api/config/folder` add / activate / remove | `o` picker |
| `/api/fs/list?path=` → subdirectories | folder-picker browsing |
| `/api/quit` | `q` |

No in-app .torrent-file open is added — the TUI never had one (CLI arg only), and the CLI arg path stays.

## Frontend port (`src/web/`)

Same regions and layout: sidebar (categories + downloads + seeding), content panel, footer hints, `?` help overlay, splash view.

| Ink component | Web fate |
|---|---|
| Sidebar, Results, Downloads, Seeding, Panel, Footer, HelpOverlay, TabTitle, Rule, ErrorDetail | Port 1:1 — Ink `<Box>/<Text>` → `<div>/<span>` + CSS |
| SearchBar, TextField | Native `<input>`; the hand-rolled cursor/editing code (~150 lines) is deleted |
| ProgressBar, Spinner, sheen | CSS animations, same glyph look |
| FolderPrompt, ThrottlePrompt, TrackersPrompt | Modal dialogs, same flows; FolderPrompt browses via `/api/fs/list` |
| Logo, logo.ts, theme.ts | Kept; theme colors become CSS custom properties |

**Store.** Same `Store` shape, new backing: hooks read from one SSE-fed context (`useServerState`) instead of the in-process `DownloadQueue`; actions become `fetch` POSTs. Selection/region/focus state stays local React state and ports as-is. `sort.ts`, `move.ts`, `keymap.ts`, `format.ts` are reused **verbatim** (shared imports, including their tests).

**Keyboard.** One `window` `keydown` dispatcher replicating App.tsx's `useInput` logic: same keys, same region and capture-mode rules. Keys are suppressed while an input or modal captures, exactly like the TUI's capture modes. Mouse added on top: click a row to select, click the sidebar to open a section, row buttons mirror the footer actions.

**Style.** Monospace, dark, TUI palette from theme.ts, box-drawing-style borders in CSS. Fixed-ish desktop layout; no responsive/mobile work.

## Build, packaging, tests

**Build.** tsup keeps building the server → `dist/cli.cjs`, same `bin`. Vite builds the SPA → `dist/web/`, which the server serves statically. `files: ["dist"]` already ships it, so the published package is prebuilt and `npx torlnk` is unchanged for users. `preview/` is removed from `files`.

**Dependencies.** Runtime shrinks to `env-paths`, `parse-torrent`, `webtorrent`. `ink` and `ink-testing-library` are removed; `react`, `react-dom`, `vite`, `@vitejs/plugin-react` are devDependencies (the SPA is bundled at publish time).

**Dev.** `npm run dev` = server on a fixed port + Vite dev server proxying `/api`, giving hot reload.

**Tests.**
- Core tests (download, sources, config, util, cli): untouched.
- `sort.test`, `move.test`: move with the shared code, unchanged.
- Ink component tests (FolderPrompt, ThrottlePrompt): logic assertions survive as React DOM tests; assertions about the deleted hand-rolled input code die with it.
- New: server route tests — vitest against a real server instance, fetch + SSE assertions, including the 401-without-token case.

**Error handling.** Action failures return `{error}` JSON with a status code and surface the same way the TUI surfaces them (failed list, ErrorDetail, notices). SSE drops recover via EventSource auto-reconnect + snapshot resync.

**Deletions.** `src/ui/` (Ink), `scripts/render-previews*`, `preview/`, the alt-screen/terminal-restore code in `src/index.tsx`.

## Out of scope

- New features of any kind (multi-client, remote access, mobile layout, .torrent upload UI).
- README rewrite/screenshots (manual follow-up).
- LAN or hosted deployment.
