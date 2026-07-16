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

## Documentation cleanup review

### Scope

Updated `README.md` and `CONTRIBUTING.md`; this section was appended to the existing report. Existing code and package changes were preserved.

### Stale-reference searches

Command:

```sh
rtk grep -n -i -E 'preview|src/ui|render-previews|previews' README.md CONTRIBUTING.md
```

Output (exit status 1; stdout is empty):

```text
```

Additional targeted searches:

```sh
rtk grep -n -E 'preview/(splash|browse|downloads)\\.svg|src/ui/|render-previews|npm run previews' README.md CONTRIBUTING.md
```

Output (exit status 1; stdout is empty):

```text
```

```sh
rtk grep -n -E 'src/(ui|util)|render-previews|npm run previews|preview/' README.md CONTRIBUTING.md
```

Output (exit status 1; stdout is empty):

```text
```

### Current web workflow

- `npm run dev:server` starts the local API server on port 9877.
- `npm run dev` starts the Vite React app from `src/web` and proxies `/api/` to the local API server.
- `npm run build` builds the server and web bundles.

## README tagline cleanup

Updated the stale tagline in `README.md` to describe torlink as a local web app.
No surrounding README copy was changed.

### Targeted stale-TUI phrase search

Command:

```sh
rtk grep -n -i -E 'lives in your terminal|terminal-native|\btui\b|\bink\b' README.md
```

Exact output (exit status 1; stdout is empty):

```text
```

### Pull request template stale-path search

Command:

```sh
rtk proxy rg -n -F -e 'src/ui/keymap.ts' -e 'scripts/render-previews-impl.tsx' .github/PULL_REQUEST_TEMPLATE.md || echo '(no matches)'
```

Exact output:

```text
(no matches)
```

## Local web-app copy cleanup

Updated stale user-facing terminal-native wording in the CLI help, splash
screen, npm metadata, and Nix package metadata to describe torlink as a local
web app. No unrelated CLI behavior or formatting was changed. The lockfile was
not updated because its package metadata does not include the package
description.

### Verification

Targeted stale-copy search over the owned files:

```sh
$ rtk proxy rg -n -i -e 'terminal-native' -e 'terminal native' -e 'lives in your terminal' -e 'right in your terminal' src/cli/args.ts src/web/views/Splash.tsx package.json flake.nix nix/package.nix || true
```

Exact output (no matches; exit status 0 because of `|| true`):

```text
```

Broader stale-copy search, excluding generated files, the lockfile, and this
report:

```sh
$ rtk proxy rg -n -i -e 'terminal-native' -e 'terminal native' -e 'lives in your terminal' -e 'right in your terminal' . --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json' --glob '!.superpowers/**' --glob '!.git/**' || true
```

Exact output (the remaining match is an existing test assertion outside this
task's owned files; exit status 0 because of `|| true`):

```text
./src/web/views/Splash.test.tsx:30:    expect(view.getByText("A curated, terminal-native torrent downloader.")).toBeTruthy();
```

Typecheck:

```sh
$ rtk npm run typecheck
> tsc --noEmit
```

Exit status 0.

## Splash tagline test alignment

Updated the stale `Splash` test expectation to match the component's current
tagline: `A curated, local web app for torrent downloads.`

### Verification

Focused Splash test:

```text
$ rtk npm test -- src/web/views/Splash.test.tsx
> vitest run src/web/views/Splash.test.tsx
 RUN  v4.1.9 /Users/grillermo/c/torlink/.worktrees/feat-web-ui
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  16:53:34
   Duration  803ms (transform 115ms, setup 0ms, import 227ms, tests 81ms, environment 354ms)
```

Exit status: 0.

Typecheck:

```text
$ rtk npm run typecheck
> tsc --noEmit
```

Exit status: 0.
