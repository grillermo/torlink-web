# Task 13 — Results web port

## Changes

- Added `src/web/components/Results.tsx`, porting the Results view to the React/Vite UI.
  - Uses web Store context, `useConcurrentSearch`, Task 9 `sort.ts`, and `wrapStep`.
  - Preserves category filtering; loading, empty, outage, and results status copy; sort cycling; list/detail modes; and download/copy actions.
  - Supports active-only keyboard listeners with cleanup, click selection, double-click/Enter detail entry, and selected-row scrolling.
- Added focused jsdom coverage in `src/web/components/Results.test.tsx` for category/sort behavior, loading/empty states, actions, click/double-click handling, and listener cleanup.
- Integrated Results as App's default browser content while retaining the `children` injection seam used by App tests.
- Added only token-based Results/source CSS in `src/web/theme.css`; no new dependencies or raw inline colors/fonts.

## TDD record

1. Added the focused Results test before the component existed.
2. Red command:
   - `npm test -- src/web/components/Results.test.tsx`
   - Expected red result: `Failed to resolve import "./Results"` because the component had not been created.
3. Implemented the component and re-ran focused tests until green.

## Verification

- `npm test -- src/web/components/Results.test.tsx`
  - `Test Files 1 passed (1); Tests 3 passed (3)`
- `npm run typecheck`
  - `TypeScript: No errors found`
- `npm test`
  - `Test Files 34 passed (34); Tests 216 passed (216)`
- `npm run build`
  - `tsup` build success; Vite built 63 modules; `postbuild: wrote dist/cli.cjs`
- Live smoke:
  - `npm run dev -- --host 127.0.0.1 --port 4173`
  - `curl -sS -o /tmp/torlink-results-smoke.html -w '%{http_code} %{size_download}\\n' http://127.0.0.1:4173/`
  - Output: `200 591`; the returned document contains `id="root"`.
  - No favicon 404 was observed during this HTTP smoke.

## Commit

- `feat(web): port results view`

## Review Fix — Task 13

- Added a regression test proving a result click from the inactive/sidebar region requests `setRegion("content")`.
- Updated result row mouse selection to set the cursor and then activate the content region before existing double-click/detail behavior.

### TDD and verification

- Red command: `rtk npm test -- src/web/components/Results.test.tsx`
  - Output: `Tests 1 failed | 3 passed (4)`; the new test expected `setRegion("content")`, but the mock received 0 calls.
- Green command: `rtk npm test -- src/web/components/Results.test.tsx`
  - Output: `Test Files 1 passed (1)` and `Tests 4 passed (4)`.
- Typecheck command: `rtk npm run typecheck`
  - Output: `> tsc --noEmit`; exit code `0`.
