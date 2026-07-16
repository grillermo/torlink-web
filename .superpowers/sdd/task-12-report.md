# Task 12 Report — Sidebar, SearchBar, and Splash web ports

## Scope delivered

- Added browser ports for `Sidebar`, `SearchBar`, and `Splash` only.
- Wired `Splash` into the hydrated splash branch and `Sidebar` into the existing browser side-rail slot.
- Kept the established Hallmark Workbench/Terminal system: existing tokens, mono typography, N3 rail, instant focus ring, and no added motion, dependencies, breakpoints, or Task 13 views.

## TDD record

Focused jsdom suites were written before the three production components existed:

```text
rtk npm test -- src/web/components/Sidebar.test.tsx src/web/components/SearchBar.test.tsx src/web/views/Splash.test.tsx src/web/App.test.tsx
```

The red run failed as expected because `./Sidebar`, `./SearchBar`, and `./Splash` could not be resolved; the App wiring assertion also found the former splash placeholder. After the minimal ports were added, the same focused run passed: 4 files, 24 tests.

## Behavior covered

- Sidebar: active download/seeding badges, wrapped keyboard movement, accessible current selection, and click-to-content navigation.
- SearchBar: controlled/synchronized native input, capture-mode focus/cleanup, Enter submit, Escape/down exit, and caret-zero left exit.
- Splash: source-derived category copy, Logo/search/footer copy, non-empty and empty submits, and Escape/Ctrl+C quit paths from input ownership.
- App: hydrated splash and browser sidebar placement.

## Implementation notes

- `Sidebar` exports the Ink-derived `RAIL_WIDTH` in `ch`, counts `downloading` queue items and `seeding` seed items from `useStore().state`, and cleans up its focused window key listener.
- `SearchBar` preserves the Ink props and panel layout while using a controlled browser input and the store capture-mode interface.
- `Splash` derives categories from `sourcesByGroup()`, uses the existing web `Logo`, and delegates all search submission to `submitQuery`.
- CSS additions use existing semantic Terminal tokens/classes; focus remains the existing instant 2px tokenized ring.

## Verification

| Check | Result |
| --- | --- |
| Focused Task 12 tests | 4 files, 24 tests passed |
| `rtk proxy npm run typecheck` | passed |
| `rtk npm test` | 33 files, 210 tests passed |
| `rtk npm run build` | passed (`tsup`, Vite, postbuild) |

## Live smoke

Started the local backend and Vite server, then opened `http://127.0.0.1:5173/?token=dev` in headless Chrome. The hydrated splash contained the Logo and search input; submitting `ubuntu` changed to the browser view with the Sidebar and its `All` button present.

Browser console findings: Vite connection debug messages and the React DevTools informational message only, plus the known pre-existing 404 resource error (favicon). No component exception or new console error appeared.

## Concerns

None from Task 12. The known favicon 404 remains pre-existing and was not changed.

## Review finding fix — selected sidebar marker parity

Restored the Ink marker palette independently of selected label colors: selected markers receive `var(--color-rule)` while the sidebar is unfocused and `var(--color-bright)` while it is focused. Existing selected button label states remain `var(--color-alt)` (unfocused) and `var(--color-accent)` (focused).

### TDD evidence

1. Added the focused selected-marker regression assertion in `Sidebar.test.tsx`.
2. Red run:

   ```text
   rtk proxy npx vitest run src/web/components/Sidebar.test.tsx
   Test Files  1 failed (1)
   Tests  1 failed | 3 passed (4)
   AssertionError: expected false to be true
   ```

3. Added marker-specific `sidebar-marker-selected` and `sidebar-marker-selected-focused` classes plus tokenized CSS rules.
4. Green run:

   ```text
   rtk proxy npx vitest run src/web/components/Sidebar.test.tsx
   Test Files  1 passed (1)
   Tests  4 passed (4)
   ```

5. Typecheck:

   ```text
   rtk proxy npm run typecheck
   > tsc --noEmit
   exit 0
   ```

### Changed files

- `src/web/components/Sidebar.tsx`
- `src/web/components/Sidebar.test.tsx`
- `src/web/theme.css`
- `.superpowers/sdd/task-12-report.md`

## Review finding fix — preserve native search editing

Updated `SearchBar` so `onExitLeft` fires only for plain ArrowLeft when the
input selection is collapsed at offset 0. Ctrl/Meta/Alt/Shift-modified
ArrowLeft and selections beginning at offset 0 with a non-zero end are left to
the browser's native editing behavior. Added regression coverage for Ctrl,
Meta, and Alt modifiers plus a non-collapsed selection.

### TDD evidence

1. Added the SearchBar regression test before changing production code.
2. Red run:

   ```text
   rtk npm test -- src/web/components/SearchBar.test.tsx
   Test Files  1 failed (1)
   Tests  1 failed | 3 passed (4)
   AssertionError: expected "vi.fn()" to not be called at all, but actually been called 3 times
   ```

3. Updated the ArrowLeft guard to require no modifiers and
   `selectionStart === selectionEnd === 0`.
4. Green run:

   ```text
   rtk npm test -- src/web/components/SearchBar.test.tsx
   Test Files  1 passed (1)
   Tests  4 passed (4)
   ```

5. Typecheck:

   ```text
   rtk npm run typecheck
   > tsc --noEmit
   exit_code=0
   ```

### Changed files

- `src/web/components/SearchBar.tsx`
- `src/web/components/SearchBar.test.tsx`
- `.superpowers/sdd/task-12-report.md`

## Review finding fix — keep Splash ArrowDown navigation safe

`Splash` no longer passes `quitAll` to `SearchBar.onExitDown`, because the
SearchBar contract invokes that callback for ArrowDown navigation as well as
Escape. Splash now handles only Escape and Ctrl+C as quit shortcuts; normal
SearchBar ArrowDown behavior remains available to its other consumers.

### TDD evidence

Regression test added first:

```text
it("does not quit when SearchBar moves down", () => {
  const { getByRole, store } = renderSplash();
  fireEvent.keyDown(getByRole("textbox"), { key: "ArrowDown" });
  expect(store.quitAll).not.toHaveBeenCalled();
});
```

Red run:

```text
$ rtk npm test -- src/web/views/Splash.test.tsx
> vitest run src/web/views/Splash.test.tsx
 RUN  v4.1.9 /Users/grillermo/c/torlink/.worktrees/feat-web-ui
 ❯ src/web/views/Splash.test.tsx (4 tests | 1 failed) 83ms
     × does not quit when SearchBar moves down 12ms
 Test Files  1 failed (1)
      Tests 1 failed | 3 passed (4)
```

Green focused Splash run:

```text
$ rtk npm test -- src/web/views/Splash.test.tsx
> vitest run src/web/views/Splash.test.tsx
 RUN  v4.1.9 /Users/grillermo/c/torlink/.worktrees/feat-web-ui
 Test Files 1 passed (1)
      Tests 4 passed (4)
```

Typecheck:

```text
$ rtk npm run typecheck
> tsc --noEmit
```

Both green verification commands exited with code 0.

### Changed files

- `src/web/views/Splash.tsx`
- `src/web/views/Splash.test.tsx`
- `.superpowers/sdd/task-12-report.md`
