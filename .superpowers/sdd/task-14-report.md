# Task 14 report

## Scope

Ported the Downloads and ErrorDetail TUI components to the React/Vite UI. The web Downloads view preserves active queue ordering, recent-history ordering, focus states (`downloading`, `paused`, `failed`, `recent`), `p`/`c`/`f`/`d`/`x` actions, failed-item Enter behavior, click selection, double-click entry, selected-row scrolling, keyboard gating, and listener cleanup. ErrorDetail is mounted in the existing Task 10 overlay slot and is dismissed by the existing global dispatcher.

## TDD red

Command:

```text
npm test -- src/web/components/Downloads.test.tsx src/web/components/ErrorDetail.test.tsx
```

Output before implementation:

```text
Test Files  2 failed (2)
Tests  no tests
Error: Failed to resolve import "./Downloads" from "src/web/components/Downloads.test.tsx".
Error: Failed to resolve import "./ErrorDetail" from "src/web/components/ErrorDetail.test.tsx".
```

## Verification

Command:

```text
npm test -- src/web/components/Downloads.test.tsx src/web/components/ErrorDetail.test.tsx
```

Output:

```text
Test Files  2 passed (2)
Tests  5 passed (5)
```

Command:

```text
npm run typecheck
npm test -- src/web/App.test.tsx src/web/components/Results.test.tsx src/web/components/Downloads.test.tsx src/web/components/ErrorDetail.test.tsx
```

Output:

```text
> tsc --noEmit
Test Files  4 passed (4)
Tests  24 passed (24)
```

Command:

```text
npm test
npm run build
```

Output:

```text
Test Files  36 passed (36)
Tests  222 passed (222)
ESM Build success in 43ms
vite v6.4.3 building for production...
✓ 66 modules transformed.
✓ built in 497ms
postbuild: wrote dist/cli.cjs
```

Command:

```text
npm run dev -- --host 127.0.0.1 --port 4173
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4173/
```

Output:

```text
200
```

## Task 14 review follow-up

User decision: preserve the source-compatible animated progress sheen on downloading rows (`animate` remains enabled for downloading items); do not remove it. Fix the remaining Important bug: direct double-click actions must operate on the row that was double-clicked, rather than the current selected-row closure.

## TDD red

Added direct failed-row and recent-row double-click regression tests before changing production code.

Command:

```text
rtk npm test -- src/web/components/Downloads.test.tsx
```

Output:

```text
Test Files  1 failed (1)
Tests  2 failed | 3 passed (5)
double-clicks a failed row using that row's item: Number of calls: 0
double-clicks a recent row using that row's item: Number of calls: 0
```

## Fix details

ActiveRow and RecentRow now receive item-parameterized enter callbacks and invoke them with their own `item` from `onDoubleClick`. Failed active rows call `showError` for that failed item; recent rows call `startDownload` for that history item. The downloading progress sheen remains `animate={item.status === "downloading"}`.

## Verification

Command:

```text
rtk npm test -- src/web/components/Downloads.test.tsx src/web/components/ErrorDetail.test.tsx
```

Output:

```text
Test Files  2 passed (2)
Tests  7 passed (7)
```

Command:

```text
rtk npm run typecheck
```

Output:

```text
> tsc --noEmit
```
