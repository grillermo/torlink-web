# Task 15: Seeding web port

Implemented the React/Vite Seeding view and connected it to the existing web Store/API action pattern.

## Changes

- Added `src/web/components/Seeding.tsx` with source-compatible seeding summary, history rows, status visuals, source tags, selection, scrolling, and content-focus-gated keyboard handling.
- Added `src/web/components/Seeding.test.tsx` covering TUI-order status groups, summary totals, click/key selection, `p` pause/resume behavior, missing-file notice, removal, inactive-region keyboard gating, and seed-focus cleanup.
- Added the minimal web Store/App `toggleSeed` action, posting to the existing `/api/seeds/:id/:action` routes.
- Routed the `seeding` section to the new component and added tokenized Terminal/Hallmark CSS grid styles.

## TDD evidence

1. Wrote `src/web/components/Seeding.test.tsx` before `Seeding.tsx` existed.
2. Red command:

   ```text
   $ rtk npm run test -- src/web/components/Seeding.test.tsx
   > vitest run src/web/components/Seeding.test.tsx
   Test Files  1 failed (1)
   Error: Failed to resolve import "./Seeding" from "src/web/components/Seeding.test.tsx". Does the file exist?
   ```

3. Implemented the component and integration, then corrected one test expectation to match the existing formatter (`2.93 KB` for 3,000 bytes).

## Verification

```text
$ rtk npm run test -- src/web/components/Seeding.test.tsx
> vitest run src/web/components/Seeding.test.tsx
Test Files  1 passed (1)
Tests  3 passed (3)

$ rtk npm run typecheck
> tsc --noEmit
exit 0

$ rtk npm test
> vitest run
Test Files  37 passed (37)
Tests  227 passed (227)

$ rtk npm run build
> tsup && vite build
ESM Build success
vite v6.4.3 building for production...
✓ 67 modules transformed.
✓ built in 532ms
postbuild: wrote dist/cli.cjs
exit 0

$ rtk npm run dev:server
exit 0 (server started in the background; no filtered output)

$ rtk curl -sS -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:9877/'
200
```

The optional `/api/events` smoke request was started and then terminated because it correctly remains open as an SSE stream; it did not indicate a failure.
