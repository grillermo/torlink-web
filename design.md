# Design — torlink

A locked design system for this app. Every view redesign reads this file before
emitting code. Do not regenerate per view — extend or amend this file when the
system needs to grow.

Derived from the Stitch "Terminal Protocol" reference. torlink is a local,
offline-first torrent workbench: dark-mode-only, monospace-only, keyboard-first
on desktop and touch-first on mobile.

## Genre

atmospheric — technical TUI. Cyber-minimalist, "digital noir". The interface is
a command deck, not a consumer app. Information density is a feature.

## Macrostructure family

torlink has no marketing or content pages. Every view is an app view.

- App views: **Workbench** — rail/tab nav + content region + hint footer.
  Variation knobs: content-region archetype only (table · card list · form
  sheet · splash). Nav, footer, and shell never vary.

## Theme

Terminal, re-anchored to the reference. Dark-only — `color-scheme: dark`, no
light variant. Paper is flat and singular; depth comes from border brightness,
never fills or shadows.

- `--color-bg`             oklch(18.72% 0.0020 286.20)  /* #131314 */
- `--color-bg-sunk`        oklch(16.42% 0.0021 286.17)  /* #0e0e0f */
- `--color-panel`          oklch(24.08% 0.0024 325.65)  /* #201f20 */
- `--color-panel-high`     oklch(28.54% 0.0018 286.29)  /* #2a2a2b */
- `--color-text`           oklch(91.54% 0.0035 354.70)  /* #e5e2e3 */
- `--color-alt`            oklch(82.90% 0.0228 312.15)  /* #ccc3d2 */
- `--color-rule`           oklch(39.98% 0.0209 304.32)  /* #4a4551 */
- `--color-rule-bright`    oklch(65.73% 0.0220 308.09)  /* #958e9c */
- `--color-accent`         oklch(66.84% 0.1362 299.23)  /* #a180dc — interactive */
- `--color-bright`         oklch(83.64% 0.0970 301.18)  /* #d4bbff — wordmark, active */
- `--color-on-accent`      oklch(32.63% 0.1416 295.28)  /* #3d1a73 — text on accent fill */
- `--color-focus`          var(--color-bright)

Functional colours — used sparingly; the terminal stays monochromatic by
default. Every status colour sits in the 79–84 % lightness band so no status
shouts louder than another.

- `--color-good`           oklch(79.53% 0.1395 130.14)  /* seeding, complete */
- `--color-info`           oklch(82.65% 0.0899 250.43)  /* downloading, progress */
- `--color-warn`           oklch(82.29% 0.1448 107.00)  /* paused, stalled */
- `--color-bad`            oklch(83.83% 0.0891 26.76)   /* failed */

Source identity — one hue per tracker, same lightness band:

- `--color-source-solid`   oklch(71.90% 0.1322 264.20)
- `--color-source-tpb`     oklch(82.17% 0.0996 182.49)
- `--color-source-1337x`   oklch(78.70% 0.1373 50.56)

**Accent discipline:** `--color-accent` and `--color-bright` together stay under
5 % of any viewport. They mark the prompt caret, the active nav item, and the
focused row. Nothing else.

## Typography

Monospace-only is the design, not a shortcut — this is the sanctioned
single-font exception. JetBrains Mono is bundled via `@fontsource-variable`, not
CDN-linked: torlink must render correctly with no network.

- Display: JetBrains Mono, weight 800, style normal, tracking -0.04em
- Body:    JetBrains Mono, weight 400
- Mono:    JetBrains Mono (same face — `--font-display`, `--font-body`, and
           `--font-mono` all resolve to it)
- Labels:  weight 500, uppercase, tracking 0.05em
- Type scale anchor: `--text-display` = clamp(2rem, 6vw, 2.5rem)
  (40px desktop → 32px mobile, per the reference's mobile adjustment)
- Body never scales below 14px — density must not cost legibility.

All headings roman. No italic headers, ever.

## Spacing

4-point named scale. Values live in `tokens.css`. Views must use named tokens
(`var(--space-md)`), never raw values.

- Gutter: `--space-sm` (16px)
- Margin mobile: `--space-sm` (16px) · margin desktop: `--space-lg` (32px)
- Container max: 1200px

## Shape

**Sharp — 0px, everywhere.** Buttons, inputs, cards, chips, sheets, dropdowns
all take 90° corners. `--radius-none` is the only radius token. The single
exception is iconography that needs curves to stay legible.

## Elevation

Tonal wireframes. No shadows, no blurs, no semi-transparent scrims.

- Depth reads through **border brightness**, not fill. Background stays flat.
- Resting panel: 1px `--color-rule`. Raised/active: 1px `--color-accent`.
- Glow: `0 0 8px` in accent — hover and active selection only. This is the one
  place a shadow is allowed, and it simulates CRT bloom, not elevation.
- Modals and sheets: solid `--color-bg` + 1px accent border. Never a backdrop
  blur.

## Motion

No motion library. CSS only.

- Easings: `--ease-out` cubic-bezier(0.16, 1, 0.3, 1) · `--ease-in` · `--ease-in-out`
- Durations: `--dur-fast` 100ms · `--dur-base` 150ms · `--dur-slow` 240ms
- Reveal pattern: **none.** Content appears. This is a terminal; rows do not
  fade in.
- Animate `transform` and `opacity` only.
- Reduced-motion fallback: opacity-only, ≤150ms.
- Focus rings never animate — they appear instantly.

## Microinteractions stance

- Silent success. A completed download updates its row; it does not toast.
  The one notice line in the header is the whole notification surface.
- Optimistic update + undo over confirmation dialogs.
- Hover tooltip delay 800ms · focus tooltip delay 0ms.
- Under three motion primitives per view.

## CTA voice

- Primary: solid `--color-accent` fill, `--color-on-accent` text, 0px corners,
  uppercase label.
- Secondary (ghost): 1px `--color-accent` border, accent text, transparent fill.
- Copy pattern: bare imperative verb, lowercase-keyed where it mirrors a
  keybinding — `[p]ause`, `[d]elete`. The bracket marks the key.

## Inputs

Styled as a command prompt, not a form field.

- Every text input carries a `>` prefix character in `--color-accent`.
- Focus state: solid accent block caret + 1px glowing accent border.
- Placeholder in `--color-rule-bright`.

## Data presentation

- **Tables:** no vertical rules. Horizontal 1px dashed separators between rows.
  Headers uppercase, `--text-label`.
- **Chips/badges:** 1px bordered box, transparent fill. Status carried by
  border colour.
- **Checkboxes/radios:** square. Checked = `X` glyph or solid block fill.
  Selected radio = smaller solid square inside the border.
- **Progress:** ASCII bar — `[====>    ]` — in `--color-info`. Not a styled div.

## Navigation

- **Active state:** 4px solid vertical bar left of the item + text to
  `--color-bright`.
- **Breadcrumbs:** rendered as file paths — `~/root/directory/page`.

## Responsive

Single breakpoint at **768px**. Below it the app is touch-driven; above it,
keyboard-driven. Both must work at the boundary.

- ≥768px — N3 side rail (categories + library, as today), Ft2 inline-rule
  keyboard hint footer, full-width tables.
- <768px — side rail collapses. Categories become a horizontal filter chip row
  under the search prompt; library becomes a **bottom tab bar**
  (Browse · Downloads · Seeding · Settings). Tables reflow to stacked cards.
  The hint footer hides — there is no keyboard to hint at.
- Verified at 320 / 375 / 414 / 768px. No horizontal scroll at any width;
  `overflow-x: clip` on `html` and `body`, never `hidden`.
- Tap targets ≥44px. No clickable text wraps to two lines.
- **Every keybinding has a tap route.** The selected row grows a strip of
  ghost buttons (`.row-actions`) restating its keys — pause, cancel, retry,
  download, copy. Prompts and overlays carry explicit save/cancel/close
  buttons. Sort headers are tappable. Keyboard hint lines take `.kb-only`
  and hide below the breakpoint; the strips and buttons render at every
  width, doubling as the mouse route on desktop.

## Per-view allowances

- App views MUST NOT use enrichment. Function carries the page.
- The splash view MAY carry the wordmark at display size. Nothing else.

## What views MUST share

- The wordmark and its terminal-glyph mark.
- The accent colour and its ≤5 % placement.
- JetBrains Mono at every level.
- The CTA voice (0px corners, bracket-keyed labels).
- The shell: header + rule + content + (footer | tab bar).
- The `>` prompt prefix on every text input.

## What views MAY differ on

- Content-region archetype — table (Results) · card list (Downloads, Seeding) ·
  form sheet (Settings) · splash. Within the Workbench shell only.
- Which status colours appear.

## Exports

Drop-in formats for re-using this design system in other projects.

### tokens.css

The canonical source is [`tokens.css`](tokens.css) at the project root. It is
imported by `src/web/theme.css` and carries every `--color-*`, `--font-*`,
`--space-*`, `--text-*`, `--ease-*`, `--dur-*`, `--rule-*`, and `--radius-*`
token used in the build.

### DTCG `tokens.json`

```json
{
  "color": {
    "bg":     { "$value": "oklch(18.72% 0.0020 286.20)", "$type": "color" },
    "text":   { "$value": "oklch(91.54% 0.0035 354.70)", "$type": "color" },
    "accent": { "$value": "oklch(66.84% 0.1362 299.23)", "$type": "color" },
    "bright": { "$value": "oklch(83.64% 0.0970 301.18)", "$type": "color" },
    "rule":   { "$value": "oklch(39.98% 0.0209 304.32)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "JetBrains Mono", "$type": "fontFamily" },
    "body":    { "$value": "JetBrains Mono", "$type": "fontFamily" }
  },
  "space": {
    "sm": { "$value": "1rem",   "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" }
  }
}
```
