# URL State Tracking — Design

Date: 2026-07-17
Status: Approved

## Goal

Track navigable app state in the URL so refresh restores the current view (e.g. open settings → URL changes → refresh re-opens settings), and browser back/forward work naturally.

## Scope

All navigable state goes in the URL:

- View (splash vs browser)
- Section (tab): `all | games | movies | tv | anime | downloads | seeding`
- Search query
- Overlays: settings sheet, folder prompt, trackers prompt, throttle prompts, help

Out of scope (stays in memory):

- Error detail overlay (`errorItem`) — item-specific, may not exist after refresh
- Focus/region/capture-mode state (`region`, `captureMode`, `downloadFocus`, `seedFocus`)

## URL map

| URL | Renders |
|---|---|
| `/` | Splash |
| `/:section` | Browser view, section = `all\|games\|movies\|tv\|anime\|downloads\|seeding` |
| `/:section/:overlay` | Overlay on top of section, overlay = `settings\|folder\|trackers\|throttle-download\|throttle-upload\|help` |
| `?q=dune` | Search query param, lives on section URLs |
| Unknown path | Redirect to `/` |

Notes:

- Overlay slugs `throttle-download` / `throttle-upload` map to the existing `prompt` values `download` / `upload` (avoids the confusing `/downloads/download`).
- Path routing (no hash). Requires server SPA fallback (see Server section).

## Architecture

**react-router (BrowserRouter), URL as source of truth, store interface unchanged.**

- `main.tsx` wraps `<App />` in `<BrowserRouter>`.
- `App.tsx` deletes `useState` for `view`, `section`, `query`, `prompt`, `settingsOpen`, `showHelp`. These values are derived from `useParams` / `useLocation` / `useSearchParams`:
  - `view`: `"splash"` when path is `/`, else `"browser"`.
  - `section`: first path segment, validated against the section union; invalid → redirect `/`.
  - `overlay`: second path segment, validated; maps to `prompt` / `settingsOpen` / `showHelp` equivalents.
  - `query`: `q` search param (empty string when absent).
- Setters become thin `navigate()` wrappers with the same signatures, so the `Store` interface in `store.ts` is unchanged and all components, `keyboard.ts`, and `keymap.ts` are untouched:
  - `setView("browser")` → navigate to `/all` (or current section); `setView("splash")` → navigate `/`.
  - `setSection(s)` → navigate `/:s` preserving `?q`.
  - `submitQuery(q)` → navigate `/:section?q=…` (existing magnet-detection logic preserved).
  - Open overlay → navigate `/:section/:overlay`; close → navigate `/:section`.

Rejected alternative: declarative `<Routes>` restructure — fights the store-context architecture, big diff, no user-visible gain.

## History semantics

- Section switch → push.
- Open overlay → push. Close (Esc / cancel) → navigate to parent section path. Back button also closes the overlay.
- `submitQuery` → push. Only committed searches hit the URL; keystrokes don't.
- Navigating to the current URL → no-op (no duplicate history entries).

## Server

`serveStatic` in `src/server/http.ts` gains SPA fallback:

- GET, non-`/api`, non-`/assets` path **without a file extension** → serve `index.html`.
- Paths with extensions keep existing 404 behavior.
- Vite dev server already falls back to `index.html` (default SPA behavior).

## Testing

- `App.test.tsx`: wrap renders in `MemoryRouter`. New tests:
  - Deep link `/downloads/settings` restores tab + settings sheet.
  - Section click changes URL.
  - Esc closes overlay and URL returns to section path.
  - Unknown path redirects to `/`.
  - `?q=` restored into search on load.
- `http.test.ts`: GET `/downloads` returns index.html; GET `/nope.png` still 404s.

## Dependencies

- `react-router` (new dependency).
