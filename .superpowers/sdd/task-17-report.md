# Task 17 Report

## Changes

- Moved the web-shared `sort`, `keymap`, `move`, `theme`, `sheen`, and `logo`
  modules (plus the `sort` and `move` tests) from `src/ui/` to `src/web/`.
- Updated all web and retained SVG-helper imports to the new locations.
- Removed the remaining Ink TUI, preview renderer scripts, preview assets, and
  the obsolete package metadata/dependencies.
- Ran `npm install` to update `package-lock.json` without adding dependencies.

## Commands and output

```text
$ rtk npm test
Test Files  41 passed (41)
Tests  240 passed (240)
Duration  3.42s
```

```text
$ rtk npm install
removed 35 packages, and audited 364 packages in 1s
82 packages are looking for funding
5 vulnerabilities (1 low, 4 high)
```

```text
$ rtk npm run typecheck && rtk npm test && rtk npm run build
> tsc --noEmit

> vitest run
Test Files  39 passed (39)
Tests  227 passed (227)
Duration  2.97s

> tsup && vite build
ESM dist/index.js 36.88 KB
ESM Build success
../../dist/web/index.html 0.44 kB
../../dist/web/assets/index-BAR8PS-C.css 8.98 kB
../../dist/web/assets/index-DI1VyvSR.js 251.47 kB
built in 511ms
postbuild: wrote dist/cli.cjs
```

```text
$ rtk proxy rg -n 'src/ui|(?:\\.\\.?/)+(?:ui/)|ink-testing-library|from ["\\x27]ink["\\x27]|"ink"|"preview"|render-previews' --glob '*.{ts,tsx,json,css}' --glob '!node_modules/**' --glob '!dist/**' .
(no matches; command exited via `|| true`)

$ rtk proxy rg -n 'node_modules/(ink|ink-testing-library)|"ink"|"ink-testing-library"' package-lock.json
(no matches; command exited via `|| true`)

$ rtk proxy test -f dist/index.js && rtk proxy test -d dist/web && rtk proxy node dist/index.js --help
torlink, terminal-native torrent search

usage
  torlnk                      start torlink and open it in your browser
  torlnk "magnet:?xt=..."     start a download on launch
  torlnk path/to/file.torrent open a .torrent file on launch
  torlnk --version            print the version
```

## Concerns

- `npm install` reports 5 audit vulnerabilities (1 low, 4 high); Task 17 did
  not add dependencies, and the requested cleanup only removed packages.
- The existing CLI help heading still says `terminal-native torrent search`.
  It is outside this task's listed cleanup scope and was left unchanged to
  avoid behavior/copy changes beyond the specified import/package work.
