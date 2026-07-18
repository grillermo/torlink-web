# Last-Route Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember the last browser route the user visited (server-side) and, on a fresh page load at `/`, redirect them there instead of the splash.

**Architecture:** Persist the route as an opaque string in `Config` (`lastRoute`). The client POSTs its section+query path to a new `POST /api/last-route` on every browser route change; on a fresh boot at `/`, the client reads `config.lastRoute` from the initial SSE snapshot and, if it parses to a valid browser route, navigates there once.

**Tech Stack:** TypeScript, Node `http`, React + react-router, Vitest.

## Global Constraints

- Node `>=22`.
- Route stored **opaquely** server-side; client owns route semantics via `parseRoute`.
- Only section+query is ever restored — never overlays.
- Redirect fires at most once per page load, only when the boot path is `/`.
- Spec: `docs/superpowers/specs/2026-07-17-last-route-redirect-design.md`.

---

### Task 1: Config `lastRoute` field + sanitizer

**Files:**
- Modify: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Config.lastRoute?: string`; `sanitizeLastRoute(value: unknown): string`; `defaultConfig.lastRoute === ""`; `loadConfig` returns a sanitized `lastRoute`.

- [ ] **Step 1: Write the failing test**

Add to `src/config/config.test.ts`:

```ts
import { sanitizeKbps, normalizeDirList, sanitizeLastRoute } from "./config";

describe("sanitizeLastRoute", () => {
  it("keeps a path that starts with a slash", () => {
    expect(sanitizeLastRoute("/all?q=ubuntu")).toBe("/all?q=ubuntu");
  });

  it("drops values that do not start with a slash", () => {
    expect(sanitizeLastRoute("all")).toBe("");
    expect(sanitizeLastRoute("http://evil/x")).toBe("");
  });

  it("falls back to empty string for non-strings", () => {
    expect(sanitizeLastRoute(undefined)).toBe("");
    expect(sanitizeLastRoute(5)).toBe("");
    expect(sanitizeLastRoute(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/config.test.ts`
Expected: FAIL — `sanitizeLastRoute` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/config/config.ts`, add `lastRoute?: string` to the `Config` interface:

```ts
export interface Config {
  downloadDir: string;
  downloadDirs: string[];
  trackers: string[];
  maxDownloadKbps: number; // 0 = unlimited
  maxUploadKbps: number; // 0 = unlimited
  lastRoute?: string; // last visited browser path, e.g. "/all?q=ubuntu"
}
```

Add `lastRoute: ""` to `defaultConfig`:

```ts
export const defaultConfig: Config = {
  downloadDir: defaultDownloadDir,
  downloadDirs: [defaultDownloadDir],
  trackers: [],
  maxDownloadKbps: 0,
  maxUploadKbps: 0,
  lastRoute: "",
};
```

Add the sanitizer (after `sanitizeKbps`):

```ts
// The remembered last route, kept only when it is a client path (a string
// starting with "/"). Anything else — non-string, or an absolute URL that
// could point off-app — collapses to "" so the client falls back to splash.
export function sanitizeLastRoute(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") ? value : "";
}
```

In `loadConfig`, sanitize after the `maxUploadKbps` line:

```ts
    cfg.maxUploadKbps = sanitizeKbps(cfg.maxUploadKbps);
    cfg.lastRoute = sanitizeLastRoute(cfg.lastRoute);
    return cfg;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (`lastRoute` is optional, so existing `Config` literals in other tests still compile).

- [ ] **Step 6: Commit**

```bash
git add src/config/config.ts src/config/config.test.ts
git commit -m "feat: persist lastRoute in config"
```

---

### Task 2: `Core.setLastRoute` + `POST /api/last-route`

**Files:**
- Modify: `src/server/core.ts`
- Modify: `src/server/http.ts`
- Test: `src/server/http.test.ts`

**Interfaces:**
- Consumes: `Config.lastRoute` (Task 1); `saveConfig`; `readJson`, `isRecord`, `PayloadTooLargeError`, `sendJson` (existing in `http.ts`).
- Produces: `Core.setLastRoute(path: string): void`; route `POST /api/last-route` accepting `{ path: string }`.

- [ ] **Step 1: Write the failing test**

Add to `src/server/http.test.ts`, inside `describe("action routes", ...)`:

```ts
  it("last-route stores a valid path and rejects a bad one", async () => {
    const { base, core } = await start();
    const ok = await fetch(`${base}/api/last-route`, {
      method: "POST",
      body: JSON.stringify({ path: "/all?q=ubuntu" }),
    });
    expect(ok.status).toBe(200);
    expect(core.config.lastRoute).toBe("/all?q=ubuntu");

    const bad = await fetch(`${base}/api/last-route`, {
      method: "POST",
      body: JSON.stringify({ path: "http://evil/x" }),
    });
    expect(bad.status).toBe(400);
    expect(core.config.lastRoute).toBe("/all?q=ubuntu");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/http.test.ts -t "last-route"`
Expected: FAIL — route returns 404 / `setLastRoute` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/server/core.ts`, add a method to the `Core` class (after `removeFolder`):

```ts
  setLastRoute(path: string): void {
    this.config = { ...this.config, lastRoute: path };
    void saveConfig(this.config);
  }
```

(`saveConfig` is already imported in `core.ts`. Do NOT emit `update` — the acting client has already navigated; the value only needs to reach the next boot's initial snapshot.)

In `src/server/http.ts`, add the route right after the `POST /api/config/folder` block (before `GET /api/events`):

```ts
    if (req.method === "POST" && pathname === "/api/last-route") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(res, 413, { error: "payload too large" });
          return;
        }
        throw error;
      }
      if (!isRecord(body) || typeof body.path !== "string" || !body.path.startsWith("/")) {
        sendJson(res, 400, { error: "invalid input" });
        return;
      }
      opts.core.setLastRoute(body.path);
      sendJson(res, 200, { ok: true });
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/http.test.ts -t "last-route"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/core.ts src/server/http.ts src/server/http.test.ts
git commit -m "feat: add /api/last-route endpoint"
```

---

### Task 3: Client reports the browser route

**Files:**
- Modify: `src/web/App.tsx`
- Test: `src/web/App.test.tsx`

**Interfaces:**
- Consumes: `POST /api/last-route` (Task 2); `post` from `./api`; `sectionPath`, `view`, `section`, `query` (existing in `App.tsx`).
- Produces: browser route changes trigger `post("/api/last-route", { path: sectionPath(section, query) })`.

- [ ] **Step 1: Write the failing test**

Add to `src/web/App.test.tsx`, inside `describe("App URL state", ...)`:

```ts
  it("reports the browser route to the server on navigation", () => {
    const view = hydrate();
    openBrowser();
    expect(mocks.post).toHaveBeenCalledWith("/api/last-route", { path: "/all?q=ubuntu" });
    act(() => currentStore!.setSection("seeding"));
    expect(mocks.post).toHaveBeenCalledWith("/api/last-route", { path: "/seeding?q=ubuntu" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/web/App.test.tsx -t "reports the browser route"`
Expected: FAIL — `post` never called with `/api/last-route`.

- [ ] **Step 3: Write minimal implementation**

In `src/web/App.tsx`, add an effect after the existing redirect effect (the `if (route.redirect)` block near line 69). `post` and `sectionPath` are already imported.

```tsx
  useEffect(() => {
    if (view !== "browser") return;
    void post("/api/last-route", { path: sectionPath(section, query) });
  }, [view, section, query]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/web/App.test.tsx -t "reports the browser route"`
Expected: PASS.

- [ ] **Step 5: Run the full App suite to catch regressions**

Run: `npx vitest run src/web/App.test.tsx`
Expected: PASS (splash-path tests keep `lastRoute` unset, so no report fires while on splash).

- [ ] **Step 6: Commit**

```bash
git add src/web/App.tsx src/web/App.test.tsx
git commit -m "feat: report browser route to server"
```

---

### Task 4: Boot redirect from `/` to the stored route

**Files:**
- Modify: `src/web/App.tsx`
- Test: `src/web/App.test.tsx`

**Interfaces:**
- Consumes: `state.config.lastRoute` (Task 1, delivered via SSE snapshot); `parseRoute` (already imported); `location`, `navigate`, `state` (existing in `App.tsx`).
- Produces: on the first render where `state` is present and `location.pathname === "/"`, if `lastRoute` parses to a valid browser route, `navigate(lastRoute, { replace: true })` exactly once.

- [ ] **Step 1: Write the failing tests**

Add to `src/web/App.test.tsx`, inside `describe("App URL state", ...)`:

```ts
  it("redirects a fresh boot at / to the stored route", () => {
    const state = { ...baseState, config: { ...baseState.config, lastRoute: "/all?q=dune" } };
    const view = hydrate(state, "/");
    expect(currentPath(view)).toBe("/all?q=dune");
    expect(currentStore?.query).toBe("dune");
  });

  it("stays on splash when there is no stored route", () => {
    const state = { ...baseState, config: { ...baseState.config, lastRoute: "" } };
    const view = hydrate(state, "/");
    expect(currentPath(view)).toBe("/");
    expect(view.container.querySelector('[data-view="splash"]')).toBeTruthy();
  });

  it("does not redirect when the boot path is not /", () => {
    const state = { ...baseState, config: { ...baseState.config, lastRoute: "/seeding" } };
    const view = hydrate(state, "/downloads");
    expect(currentPath(view)).toBe("/downloads");
  });

  it("ignores an invalid stored route and stays on splash", () => {
    const state = { ...baseState, config: { ...baseState.config, lastRoute: "/bogus/segment/here" } };
    const view = hydrate(state, "/");
    expect(currentPath(view)).toBe("/");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/web/App.test.tsx -t "boot"` — plus the four titles above.
Use: `npx vitest run src/web/App.test.tsx -t "stored route"`
Expected: FAIL — no redirect happens, `currentPath` stays `/`.

- [ ] **Step 3: Write minimal implementation**

In `src/web/App.tsx`, add a `useRef` guard near the other `useState`/`useRef` declarations:

```tsx
  const bootRedirectDone = useRef(false);
```

Add an effect after the reporting effect from Task 3:

```tsx
  useEffect(() => {
    if (bootRedirectDone.current || !state) return;
    bootRedirectDone.current = true;
    const last = state.config.lastRoute ?? "";
    if (location.pathname !== "/" || !last) return;
    const url = new URL(last, "http://x");
    const target = parseRoute(url.pathname, url.search);
    if (target.view === "browser" && !target.redirect) {
      navigate(last, { replace: true });
    }
  }, [state, location.pathname, navigate]);
```

(`useRef` is already imported at the top of `App.tsx`. The guard makes this fire at most once — an in-app return to `/` after boot will not re-trigger it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/web/App.test.tsx`
Expected: PASS (all four new tests plus the existing suite).

- [ ] **Step 5: Full check**

Run: `npm run typecheck && npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 6: Commit**

```bash
git add src/web/App.tsx src/web/App.test.tsx
git commit -m "feat: redirect / to last visited route on boot"
```

---

## Self-Review

**Spec coverage:**
- Config `lastRoute` + sanitize → Task 1.
- `core.setLastRoute` (no update emit) → Task 2.
- `POST /api/last-route` validation → Task 2.
- Client reporting section+query only → Task 3.
- Boot redirect once, `/`-only, parseRoute validation, empty→splash → Task 4.
- Behavior table (fresh load / empty / deep link / in-app splash) → covered by Task 4 tests + guard.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `lastRoute?: string`, `sanitizeLastRoute`, `setLastRoute(path)`, `{ path }` body shape used identically across Tasks 1–4.
