# Download Folders — Multiple Remembered Paths

## Goal

Let the user keep several download folders and switch the active one quickly.
The "download folder" prompt becomes a picker: choose an existing remembered
folder, add a new one, or remove one. The chosen folder becomes THE active
download destination — all new downloads go there until switched again.

## Data Model

`Config` gains a `downloadDirs: string[]` — the remembered set. `downloadDir`
keeps its current meaning: the single active destination where downloads go.
The rest of the app keeps reading `config.downloadDir` unchanged (minimal blast
radius).

```ts
export interface Config {
  downloadDir: string;      // active destination (unchanged meaning)
  downloadDirs: string[];   // remembered folders, includes the active one
  maxDownloadKbps: number;
  maxUploadKbps: number;
}
```

Invariants (enforced on load and on every mutation):

- Entries are non-empty strings, normalized (`normalizeDownloadDir`).
- No duplicates (compared after normalization).
- The active `downloadDir` is always present in `downloadDirs`.

### Migration / load

`loadConfig` tolerates legacy configs that have no `downloadDirs`:

- Missing or not an array → seed `[downloadDir]`.
- Filter out non-string / blank entries; dedupe by normalized value.
- If the active `downloadDir` is absent from the list, prepend it.
- `defaultConfig.downloadDirs = [defaultDownloadDir]`.

`saveConfig` is unchanged — it serializes the whole `Config`.

## Component — `FolderPrompt` picker

Replaces the single text field. Panel titled `download folder`. Contents:

- One row per remembered folder (in `downloadDirs` order). The active folder is
  marked (`ICON.pointer` + `COLOR.accent`). The cursor/highlighted row is shown
  distinctly from the active mark (they can differ).
- A final row: `+ add new folder…`.

Keys handled inside the prompt:

- `↑` / `k` and `↓` / `j` — move the highlight (matches existing hjkl nav).
- `↵` on a folder row → activate that folder.
- `↵` on `+ add new folder…` → reveal an inline `TextField`
  (placeholder `~/Downloads/torlink`). `↵` in the field → add + activate; `esc`
  in the field → back out to the list (does not close the prompt).
- `a` → jump straight to the add-new input.
- `d` or `delete` on a folder row → remove it from the list. Blocked on the
  **active** folder; shows notice "Can't remove the active folder." so the
  active-always-present invariant holds.
- `esc` → cancel and close the prompt (when not in the add-input).

Footer line: `↵ use · a add · d remove · esc cancel`.

## App wiring (`App.tsx`)

- `setDownloadDir(raw)` — activate. Normalize, `mkdir -p`, set
  `downloadDir`, ensure it is in `downloadDirs`, save. (Existing behavior plus
  the list-membership guarantee.)
- `addFolder(raw)` — normalize, `mkdir -p`, append to `downloadDirs` (dedupe),
  set as active `downloadDir`, save. On mkdir failure: notice, no state change.
- `removeFolder(dir)` — drop `dir` from `downloadDirs`, save. No-op (with
  notice) if `dir` is the active folder.
- `FolderPrompt` receives `dirs`, `active`, `onActivate`, `onAdd`, `onRemove`,
  `onCancel`.

Activating a folder already equal to the active one keeps the existing
"Download folder unchanged." notice.

## Error handling

- mkdir failure on add/activate → notice `Couldn't use folder: <path>`; no
  state change.
- Removing the active folder → blocked with notice; list unchanged.
- Corrupt/legacy config → migration repairs it silently (falls back to
  defaults where needed).

## Tests

`config.test.ts` additions:

- Legacy config with only `downloadDir` → `downloadDirs` seeded to `[downloadDir]`.
- Duplicate / blank / non-string entries in `downloadDirs` are dropped/deduped.
- Active `downloadDir` missing from list → prepended.
- `defaultConfig.downloadDirs` equals `[defaultDownloadDir]`.

`folder.test.ts`: unchanged (`normalizeDownloadDir` still the entry normalizer).

Component behavior (picker navigation, add, remove-blocked-on-active) covered by
App/component tests following existing patterns where present.

## Out of scope (YAGNI)

- Per-download destination choice (rejected — active-switch model chosen).
- Reordering the list.
- Editing an existing entry in place (remove + add instead).
