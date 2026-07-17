import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createServer as createViteServer, type ViteDevServer } from "vite";

describe("Vite development server", () => {
  let vite: ViteDevServer | undefined;
  let http: ReturnType<typeof createHttpServer> | undefined;

  afterEach(async () => {
    if (http?.listening) {
      http.close();
      await once(http, "close");
    }
    await vite?.close();
  });

  it("serves the frontend api.ts module instead of proxying it", async () => {
    vite = await createViteServer({
      configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)),
      server: { middlewareMode: true },
    });
    http = createHttpServer(vite.middlewares);
    http.listen(0, "127.0.0.1");
    await once(http, "listening");

    const address = http.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api.ts`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(await response.text()).toContain("torlink server unreachable");
  });
});
