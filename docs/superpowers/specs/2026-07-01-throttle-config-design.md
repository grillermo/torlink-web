# Throttle configuration (`t` key)

## Goal

Let the user press `t` to configure bandwidth throttling — max download and max
upload rate in KB/s — mirroring how `o` configures the download folder. Limits
persist to config and apply live to all active and future torrents.

## Decisions

- **UI**: one panel titled `throttle`, two stacked fields (download, upload).
  Tab / ↑ / ↓ move between fields, ↵ saves both, esc cancels. Mirrors
  `FolderPrompt`.
- **Apply scope**: live, to everything — via WebTorrent's
  `throttleDownload`/`throttleUpload`, effective immediately on running and
  future torrents.
- **Unlimited**: empty field or `0` means no cap. Shown as placeholder
  `unlimited`. Maps to WebTorrent `-1`.
- **Units**: KB/s = kilobytes/sec. Convert to bytes with `× 1024`.

## Architecture

WebTorrent 2.8.5 (already a dependency) supports both a constructor limit and a
live setter:

- `new WebTorrent({ downloadLimit, uploadLimit })` — bytes/s, `-1` = unlimited.
- `client.throttleDownload(rate)` / `client.throttleUpload(rate)` — bytes/s,
  `< 0` disables the cap.

The `TorrentEngine` creates its client lazily (`ensureClient`), so limits set
before any torrent is added still take effect when the client spins up.

### Config schema — `src/config/config.ts`

```ts
interface Config {
  downloadDir: string;
  maxDownloadKbps: number; // 0 = unlimited
  maxUploadKbps: number;   // 0 = unlimited
}
```

- `defaultConfig` gains `maxDownloadKbps: 0, maxUploadKbps: 0`.
- `loadConfig` sanitizes each field: not a finite number, or negative → `0`.
  Existing config files without the fields merge cleanly through the current
  `{ ...defaultConfig, ...parsed }` path.

### Engine — `src/download/engine.ts`

- Store `private downloadLimit = -1;` and `private uploadLimit = -1;` (bytes/s).
- `ensureClient()` passes `{ downloadLimit: this.downloadLimit, uploadLimit:
  this.uploadLimit }` to `new WebTorrent(...)`.
- New method:

  ```ts
  setLimits(downBytes: number, upBytes: number): void
  ```

  Stores both values; if a client already exists, calls
  `client.throttleDownload(downBytes)` and `client.throttleUpload(upBytes)`.

### Queue — `src/download/queue.ts`

- New method `setThrottle(downKbps: number, upKbps: number): void`.
- Converts each: `kbps <= 0 ? -1 : kbps * 1024`, then forwards to
  `engine.setLimits`.

### App boot — `src/ui/App.tsx`

In the boot effect, after `loadConfig` and queue restore, call
`q.setThrottle(cfg.maxDownloadKbps, cfg.maxUploadKbps)` so restored/queued
torrents start throttled.

### UI component — `src/ui/components/ThrottlePrompt.tsx`

New component modeled on `FolderPrompt`:

- Props: `{ width, downValue, upValue, onSubmit({down, up}), onCancel }`.
- Local state: `focus: "download" | "upload"`, plus `down` / `up` strings lifted
  from each field via `onChange`.
- Two `TextField`s in one `Panel`:
  - `isDisabled={focus !== <field>}` gates which field receives input.
  - `onExitDown` / ↑ toggles `focus`.
  - Either field's `onSubmit` calls `onSubmit({ down, up })`.
  - `onChange` strips non-digits (numeric only); empty renders placeholder
    `unlimited`.
- Own `useInput` handles `esc → onCancel`, matching `FolderPrompt`.

### App wiring — `src/ui/App.tsx`

Add `editingThrottle` state mirroring `editingFolder` at every site:

- `region` in the store → `"help"` when `editingThrottle` (line ~281).
- `useInput` guard: early-return while `editingThrottle` (line ~331), and add a
  `t` handler mirroring the `o` handler (line ~341) that sets
  `editingThrottle`.
- Render a `ThrottlePrompt` block alongside the `FolderPrompt` block (line ~412),
  seeded from `config.maxDownloadKbps` / `config.maxUploadKbps`.
- Body + footer `display:none` include `editingThrottle` (lines ~426, ~442).
- `setThrottle` callback: close prompt, parse both fields (blank → 0),
  `setConfig({ ...config, maxDownloadKbps, maxUploadKbps })`,
  `queue.setThrottle(...)`, set notice
  `Throttle: ↓1500 ↑200 KB/s` (or `unlimited` per side).

### Keymap — `src/ui/keymap.ts`

Add `{ keys: "t", label: "Throttle" }` to the Navigate help group. Kept out of
the footer, same treatment as `o`.

## Testing

- `config.test.ts`: defaults include throttle `0`/`0`; sanitize bad, negative,
  and missing values; save/load round-trip.
- `engine` / `queue`: `setThrottle` conversion (`0 → -1`, `1500 → 1536000`);
  limits set before client creation are passed to `new WebTorrent`. Reuse the
  existing no-engine test style.
- `ThrottlePrompt`: focus toggle behavior and `onSubmit` payload shape.

## Out of scope

- Per-torrent limits.
- Scheduling / time-of-day limits.
- Global speed display changes beyond the confirmation notice.
