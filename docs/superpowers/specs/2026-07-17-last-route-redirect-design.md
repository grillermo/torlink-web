# Last-route redirect

## Goal

Remember the last browser route the user visited and, on a fresh page load
at `/`, redirect them there instead of showing the splash. First-ever use
(nothing remembered) still shows the splash.

## Decisions

- **Storage:** server-side, persisted in `Config` (rides existing config
  persistence + SSE snapshot delivery). No new session file.
- **What is remembered:** section + query only (e.g. `/all?q=ubuntu`,
  `/downloads`). Overlays (settings, help, folder, trackers, throttle prompts)
  are never restored.
- **Redirect scope:** only on a fresh page load (app boots at `/`). In-app
  navigation to the splash (logo, escape) still shows the splash.
- **Opaque path:** the server stores the route as an opaque string. The client
  owns route semantics and re-validates with `parseRoute` before navigating, so
  a bad/stale value falls back to the splash.

## Server

### `Config` (`src/config/config.ts`)

- Add field `lastRoute: string`, default `""` in `defaultConfig`.
- `loadConfig` sanitize: keep `cfg.lastRoute` only when it is a string that
  starts with `/`; otherwise `""`.

### Core (`src/server/core.ts`)

- `setLastRoute(path: string): void` — set `config.lastRoute = path`, then
  `saveConfig(config)`. No `update` event emitted: the acting client has
  already navigated, and the value only needs to reach the *next* boot via the
  initial snapshot.

### HTTP (`src/server/http.ts`)

- `POST /api/last-route` — body `{ path: string }`. Validate: `isRecord(body)`
  and `typeof body.path === "string"` and `body.path.startsWith("/")`. On valid,
  `core.setLastRoute(body.path)` → `{ ok: true }`. On invalid →
  400 `{ error: "invalid input" }`. Reuse existing `readJson` /
  `PayloadTooLargeError` pattern.

## Client

### Reporting (`src/web/App.tsx`)

- On browser route change (`view === "browser"`), POST
  `{ path: sectionPath(section, query) }` to `/api/last-route`. Section + query
  only — overlays are stripped by using `sectionPath`, not the raw location.
- Fire from an effect keyed on `view`, `section`, `query`. Skip when
  `view !== "browser"`.

### Boot redirect (`src/web/App.tsx`)

- A `useRef` guard (`bootRedirectDone`) ensures the redirect fires at most once
  per page load.
- Once `state` has first loaded and the guard is unset: mark guard done. If
  `location.pathname === "/"` and `config.lastRoute` parses via
  `parseRoute(...)` to a valid `browser` route (not `redirect`, not `splash`),
  then `navigate(config.lastRoute, { replace: true })`. Otherwise do nothing
  (splash shows).
- Empty `lastRoute` (`""`) → `parseRoute` yields splash → no redirect.

## Behavior summary

| Situation | Result |
|-----------|--------|
| Fresh load at `/`, valid stored route | Redirect to stored route |
| Fresh load at `/`, empty/invalid stored route | Splash |
| Fresh load at a deep link (e.g. `/all?q=x`) | Route renders; no redirect (not `/`) |
| In-app nav to splash after boot | Splash (guard already fired) |

## Testing

- **Config** (`config.test.ts`): `lastRoute` round-trips; non-string / non-`/`
  values sanitize to `""`; default is `""`.
- **HTTP** (`http.test.ts`): `POST /api/last-route` accepts a valid path
  (calls `setLastRoute`, 200), rejects missing/non-string/non-`/` path (400).
- **Client** (`App.test.tsx`): boot redirect fires once when at `/` with a
  valid stored route; does not fire when path is not `/`, when `lastRoute` is
  empty, or when the stored value is invalid; does not re-fire on later in-app
  navigation to splash.

## Out of scope

- Restoring overlays / prompts.
- Cross-browser sync semantics beyond "whatever the single local server last
  recorded".
- Any client-side (localStorage) fallback.
