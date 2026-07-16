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
