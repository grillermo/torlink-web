# Task 16 report: prompts and help overlay web ports

## Scope delivered

- Added React/Vite ports of `FolderPrompt`, `TrackersPrompt`, `ThrottlePrompt`, and `HelpOverlay` under `src/web/components/`.
- Preserved the Ink callback contracts and copy. Folder cursor navigation, `a` add-row mode, `d` removal, Enter activation/submission, and both Escape paths are covered by Testing Library tests.
- Kept `HELP_GROUPS` as the sole help-data source by rendering the established `src/ui/keymap.ts` export.
- Connected prompt callbacks through App's existing `/api/config/folder`, `/api/config/trackers`, and `/api/config/throttle` action/notice ownership. Prompt listeners mount only while active, ignore native input targets, and clean up on unmount.
- Added token-only centered modal/backdrop styles in `src/web/theme.css`.

## TDD evidence

Initial test-first command (before the modules existed):

```text
$ rtk npm test -- src/web/components/FolderPrompt.test.tsx src/web/components/TrackersPrompt.test.tsx src/web/components/ThrottlePrompt.test.tsx src/web/components/HelpOverlay.test.tsx
Test Files  4 failed (4)
Tests  no tests
Error: Failed to resolve import "./FolderPrompt" ... Does the file exist?
Error: Failed to resolve import "./TrackersPrompt" ... Does the file exist?
Error: Failed to resolve import "./ThrottlePrompt" ... Does the file exist?
Error: Failed to resolve import "./HelpOverlay" ... Does the file exist?
```

Focused green verification:

```text
$ rtk npm test -- src/web/components/FolderPrompt.test.tsx src/web/components/TrackersPrompt.test.tsx src/web/components/ThrottlePrompt.test.tsx src/web/components/HelpOverlay.test.tsx src/web/App.test.tsx
Test Files  5 passed (5)
Tests  24 passed (24)
```

## Final verification

```text
$ rtk npm run typecheck
> tsc --noEmit
exit 0

$ rtk npm test
Test Files  41 passed (41)
Tests  236 passed (236)

$ rtk npm run build
ESM Build success in 43ms
✓ 72 modules transformed.
✓ built in 523ms
postbuild: wrote dist/cli.cjs
exit 0

$ rtk proxy npm run dev -- --host 127.0.0.1
Port 5173 is in use, trying another one...
Local: http://127.0.0.1:5174/

$ rtk proxy curl -fsS http://127.0.0.1:5174/
<!doctype html> ... <title>torlink</title> ... <div id="root"></div> ...
exit 0

$ rtk git diff --check
exit 0
```

## Notes

- No unrelated pre-existing changes were present in the worktree, and no source Ink/TUI components were changed.
- The live smoke confirmed Vite served the web application shell. It did not perform browser-driven interaction because no browser automation surface is available in this workspace.

## Review fix: folder draft reset and cursor preservation

Added regression coverage for cancelled/submitted add drafts and for preserving the selected directory when a refused removal rerenders unchanged `dirs`. Add-mode entry, Escape, and submit now clear the draft value.

### TDD red

```text
$ rtk npm run test -- src/web/components/FolderPrompt.test.tsx
> vitest run src/web/components/FolderPrompt.test.tsx
 RUN  v4.1.9 /Users/grillermo/c/torlink/.worktrees/feat-web-ui
 ❯ src/web/components/FolderPrompt.test.tsx (6 tests | 2 failed) 44ms
     × clears a cancelled add draft before the next add 7ms
     × clears a submitted add draft before the next add 4ms
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
 exit_code=1
```

### Verification

```text
$ rtk npm run test -- src/web/components/FolderPrompt.test.tsx
> vitest run src/web/components/FolderPrompt.test.tsx
 RUN  v4.1.9 /Users/grillermo/c/torlink/.worktrees/feat-web-ui
 Test Files  1 passed (1)
      Tests  6 passed (6)
 exit_code=0

$ rtk npm run test -- src/web/components/FolderPrompt.test.tsx src/web/components/ThrottlePrompt.test.tsx src/web/components/TrackersPrompt.test.tsx src/web/components/HelpOverlay.test.tsx
> vitest run src/web/components/FolderPrompt.test.tsx src/web/components/ThrottlePrompt.test.tsx src/web/components/TrackersPrompt.test.tsx src/web/components/HelpOverlay.test.tsx
 RUN  v4.1.9 /Users/grillermo/c/torlink/.worktrees/feat-web-ui
 Test Files  4 passed (4)
      Tests  12 passed (12)
 exit_code=0

$ rtk npm run typecheck
> tsc --noEmit
 exit_code=0
```
