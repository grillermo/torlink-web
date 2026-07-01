# Multiple Download Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user keep several download folders and switch the active one from a picker in the "download folder" prompt.

**Architecture:** `Config` gains a `downloadDirs: string[]` remembered set while `downloadDir` stays the single active destination. `FolderPrompt` becomes a keyboard-driven picker (activate / add / remove). `App.tsx` grows `addFolder`/`removeFolder` callbacks and keeps the list invariants on every mutation.

**Tech Stack:** TypeScript, React + Ink (terminal UI), Vitest, ink-testing-library.

## Global Constraints

- Persisted config lives at `configFile` (`src/config/paths.ts`); tests relocate state via `TORLINK_STATE_DIR`.
- Path normalization goes through `normalizeDownloadDir` (`src/config/folder.ts`).
- Theme tokens only: `COLOR`, `ICON` from `src/ui/theme.ts`. Active mark = `ICON.pointer` + `COLOR.accent`.
- The active `downloadDir` is ALWAYS present in `downloadDirs`; entries are non-empty, normalized, deduped.
- Rest of the app keeps reading `config.downloadDir` — do not change those call sites.

---

### Task 1: Config model + list invariants

**Files:**
- Modify: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Consumes: `normalizeDownloadDir` from `src/config/folder.ts`, `defaultDownloadDir` from `src/config/paths.ts`.
- Produces:
  - `interface Config { downloadDir: string; downloadDirs: string[]; maxDownloadKbps: number; maxUploadKbps: number; }`
  - `export function normalizeDirList(active: string, dirs: unknown): string[]` — returns a normalized, deduped list that always contains `active` first if it was absent.

- [ ] **Step 1: Write the failing test**

Add to `src/config/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeKbps, normalizeDirList } from "./config";

describe("normalizeDirList", () => {
  it("seeds the list from the active dir when dirs is missing", () => {
    expect(normalizeDirList("/a", undefined)).toEqual(["/a"]);
  });

  it("drops blank and non-string entries", () => {
    expect(normalizeDirList("/a", ["/a", "", "  ", 5, null, "/b"])).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("dedupes by normalized value", () => {
    expect(normalizeDirList("/a", ["/a", "/a/", "/b", "/b"])).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("prepends the active dir when absent", () => {
    expect(normalizeDirList("/a", ["/b", "/c"])).toEqual(["/a", "/b", "/c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/config.test.ts`
Expected: FAIL — `normalizeDirList` is not exported.

- [ ] **Step 3: Implement the model changes**

In `src/config/config.ts`, add `normalizeDownloadDir` to the imports from `./folder`:

```ts
import { normalizeDownloadDir } from "./folder";
```

Extend the interface and default:

```ts
export interface Config {
  downloadDir: string;
  downloadDirs: string[];
  maxDownloadKbps: number; // 0 = unlimited
  maxUploadKbps: number; // 0 = unlimited
}

export const defaultConfig: Config = {
  downloadDir: defaultDownloadDir,
  downloadDirs: [defaultDownloadDir],
  maxDownloadKbps: 0,
  maxUploadKbps: 0,
};
```

Add the helper (below `sanitizeKbps`):

```ts
// The remembered download folders, cleaned into a stable shape: every entry a
// non-empty normalized path, no duplicates, and the active dir guaranteed
// present (prepended if a hand-edited or legacy config left it out).
export function normalizeDirList(active: string, dirs: unknown): string[] {
  const list = Array.isArray(dirs) ? dirs : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of [active, ...list]) {
    if (typeof entry !== "string") continue;
    const dir = normalizeDownloadDir(entry);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    out.push(dir);
  }
  return out;
}
```

Wire it into `loadConfig`, right after the `downloadDir` guard:

```ts
    if (!cfg.downloadDir || typeof cfg.downloadDir !== "string") {
      cfg.downloadDir = defaultDownloadDir;
    }
    cfg.downloadDir = normalizeDownloadDir(cfg.downloadDir) || defaultDownloadDir;
    cfg.downloadDirs = normalizeDirList(cfg.downloadDir, cfg.downloadDirs);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS (both `sanitizeKbps` and `normalizeDirList` describe blocks).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/config.ts src/config/config.test.ts
git commit -m "feat: remember a list of download folders in config"
```

---

### Task 2: FolderPrompt becomes a picker

**Files:**
- Modify: `src/ui/components/FolderPrompt.tsx`
- Test: `src/ui/components/FolderPrompt.test.tsx` (create)

**Interfaces:**
- Consumes: `TextField` (`./TextField`), `Panel` (`./Panel`), `COLOR`/`ICON` (`../theme`).
- Produces new prop shape:
  ```ts
  interface FolderPromptProps {
    width: number;
    dirs: string[];
    active: string;
    onActivate: (dir: string) => void;
    onAdd: (raw: string) => void;
    onRemove: (dir: string) => void;
    onCancel: () => void;
  }
  ```
  Rows are `dirs` in order plus a trailing synthetic "add new" row. `onActivate` fires with the highlighted dir; `onAdd` with the typed value; `onRemove` with the highlighted dir (parent decides whether it is allowed).

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/FolderPrompt.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { FolderPrompt } from "./FolderPrompt";

const base = {
  width: 60,
  dirs: ["/home/me/Downloads", "/mnt/media"],
  active: "/home/me/Downloads",
  onActivate: () => {},
  onAdd: () => {},
  onRemove: () => {},
  onCancel: () => {},
};

describe("FolderPrompt", () => {
  it("lists remembered folders and the add row", () => {
    const { lastFrame } = render(<FolderPrompt {...base} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("/home/me/Downloads");
    expect(frame).toContain("/mnt/media");
    expect(frame.toLowerCase()).toContain("add new");
  });

  it("activates the highlighted folder on enter", () => {
    const onActivate = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onActivate={onActivate} />);
    stdin.write("\r");
    expect(onActivate).toHaveBeenCalledWith("/home/me/Downloads");
  });

  it("moves the highlight and activates the next folder", () => {
    const onActivate = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onActivate={onActivate} />);
    stdin.write("j");
    stdin.write("\r");
    expect(onActivate).toHaveBeenCalledWith("/mnt/media");
  });

  it("removes the highlighted folder on d", () => {
    const onRemove = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onRemove={onRemove} />);
    stdin.write("j");
    stdin.write("d");
    expect(onRemove).toHaveBeenCalledWith("/mnt/media");
  });

  it("adds a typed folder from the add row", () => {
    const onAdd = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onAdd={onAdd} />);
    stdin.write("a"); // jump to add input
    stdin.write("/mnt/new");
    stdin.write("\r");
    expect(onAdd).toHaveBeenCalledWith("/mnt/new");
  });

  it("cancels on escape", () => {
    const onCancel = vi.fn();
    const { stdin } = render(<FolderPrompt {...base} onCancel={onCancel} />);
    stdin.write("\x1b");
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/components/FolderPrompt.test.tsx`
Expected: FAIL — component still takes the old `value/onSubmit` props; new assertions error.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/ui/components/FolderPrompt.tsx`:

```tsx
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { TextField } from "./TextField";
import { Panel } from "./Panel";
import { COLOR, ICON } from "../theme";

interface FolderPromptProps {
  width: number;
  dirs: string[];
  active: string;
  onActivate: (dir: string) => void;
  onAdd: (raw: string) => void;
  onRemove: (dir: string) => void;
  onCancel: () => void;
}

export function FolderPrompt({
  width,
  dirs,
  active,
  onActivate,
  onAdd,
  onRemove,
  onCancel,
}: FolderPromptProps) {
  // Cursor spans the folders plus one trailing "add new" row (index dirs.length).
  const addRow = dirs.length;
  const [cursor, setCursor] = useState(() => {
    const i = dirs.indexOf(active);
    return i >= 0 ? i : 0;
  });
  const [adding, setAdding] = useState(false);

  useInput(
    (input, key) => {
      if (adding) {
        // TextField owns the keystrokes; esc backs out to the list.
        if (key.escape) setAdding(false);
        return;
      }
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.upArrow || input === "k") {
        setCursor((c) => (c > 0 ? c - 1 : c));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => (c < addRow ? c + 1 : c));
        return;
      }
      if (input === "a") {
        setCursor(addRow);
        setAdding(true);
        return;
      }
      if (key.return) {
        if (cursor === addRow) setAdding(true);
        else onActivate(dirs[cursor]);
        return;
      }
      if ((key.delete || input === "d") && cursor < addRow) {
        onRemove(dirs[cursor]);
        // Keep the cursor in range after a removal shrinks the list.
        setCursor((c) => Math.min(c, Math.max(0, dirs.length - 2)));
        return;
      }
    },
    { isActive: !adding },
  );

  return (
    <Box flexDirection="column" width={width}>
      <Panel title="download folder" width={width} focused>
        <Box flexDirection="column">
          {dirs.map((dir, i) => {
            const highlighted = i === cursor && !adding;
            const isActive = dir === active;
            return (
              <Box key={dir}>
                <Text color={highlighted ? COLOR.accent : COLOR.alt}>
                  {highlighted ? `${ICON.pointer} ` : "  "}
                </Text>
                <Text color={isActive ? COLOR.accent : COLOR.text} wrap="truncate-middle">
                  {dir}
                </Text>
                {isActive ? <Text color={COLOR.good}>{` ${ICON.done}`}</Text> : null}
              </Box>
            );
          })}
          <Box>
            <Text color={cursor === addRow && !adding ? COLOR.accent : COLOR.alt}>
              {cursor === addRow && !adding ? `${ICON.pointer} ` : "  "}
            </Text>
            {adding ? (
              <Box flexGrow={1} minWidth={0}>
                <TextField
                  placeholder="~/Downloads/torlink"
                  onSubmit={(raw) => {
                    setAdding(false);
                    onAdd(raw);
                  }}
                />
              </Box>
            ) : (
              <Text dimColor>+ add new folder…</Text>
            )}
          </Box>
        </Box>
      </Panel>
      <Box marginTop={1}>
        <Text color={COLOR.alt}>↵</Text>
        <Text dimColor> use</Text>
        <Text dimColor>{`   ${ICON.dot}   `}</Text>
        <Text color={COLOR.alt}>a</Text>
        <Text dimColor> add</Text>
        <Text dimColor>{`   ${ICON.dot}   `}</Text>
        <Text color={COLOR.alt}>d</Text>
        <Text dimColor> remove</Text>
        <Text dimColor>{`   ${ICON.dot}   `}</Text>
        <Text color={COLOR.alt}>esc</Text>
        <Text dimColor> cancel</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/components/FolderPrompt.test.tsx`
Expected: PASS (all six cases).

Note: the App still passes the old props — expect `tsc` to fail until Task 3. That is intended; do not "fix" App here beyond Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/FolderPrompt.tsx src/ui/components/FolderPrompt.test.tsx
git commit -m "feat: turn the download-folder prompt into a picker"
```

---

### Task 3: App wiring

**Files:**
- Modify: `src/ui/App.tsx` (`setDownloadDir` ~191-210; `FolderPrompt` render ~458-466)

**Interfaces:**
- Consumes: `normalizeDirList` from `../config/config`; `normalizeDownloadDir` (already imported); the new `FolderPrompt` prop shape from Task 2.
- Produces: `addFolder(raw)`, `removeFolder(dir)` callbacks; `setDownloadDir` keeps list membership.

- [ ] **Step 1: Update imports**

In `src/ui/App.tsx`, extend the config import:

```ts
import { loadConfig, saveConfig, normalizeDirList, type Config } from "../config/config";
```

- [ ] **Step 2: Keep list membership when activating**

Replace the body of `setDownloadDir` so a newly activated dir is remembered. Change the success branch:

```ts
        setConfig({
          ...config,
          downloadDir: dir,
          downloadDirs: normalizeDirList(dir, config.downloadDirs),
        });
        setNotice(`Download folder: ${truncate(dir, 48)}`);
```

- [ ] **Step 3: Add addFolder / removeFolder**

Insert directly after the `setDownloadDir` callback:

```ts
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
```

- [ ] **Step 4: Update the render site**

Replace the `<FolderPrompt .../>` block:

```tsx
            <FolderPrompt
              width={Math.max(24, Math.min(cols - 4, 62))}
              dirs={store.config.downloadDirs}
              active={store.config.downloadDir}
              onActivate={setDownloadDir}
              onAdd={addFolder}
              onRemove={removeFolder}
              onCancel={closeFolderPrompt}
            />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (App now matches the Task 2 prop shape).

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS across config, folder, and FolderPrompt tests.

- [ ] **Step 7: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat: wire the download-folder picker to add/activate/remove"
```

---

## Self-Review

- **Spec coverage:** data model + migration → Task 1; picker UI (nav, add, remove-blocked-on-active, footer) → Task 2 (UI) + Task 3 (block logic lives in `removeFolder`); App wiring → Task 3; tests → Tasks 1 & 2. All spec sections covered.
- **Remove-blocked-on-active:** UI always calls `onRemove`; the guard is `removeFolder` in Task 3 (`dir === config.downloadDir` → notice, no change). Matches spec.
- **Type consistency:** `normalizeDirList(active, dirs)` signature identical across Tasks 1 & 3. `FolderPrompt` prop names (`dirs/active/onActivate/onAdd/onRemove/onCancel`) identical across Tasks 2 & 3.
- **Placeholder scan:** none.
```
