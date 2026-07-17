import { fileURLToPath } from "node:url";
import { parseCliArgs, HELP_TEXT, type CliCommand } from "./cli/args";
import { parsePort, StartupLifecycle } from "./cli/startup";
import { Core } from "./server/core";
import { createTorlinkServer } from "./server/http";
import { openBrowser } from "./server/open";
import { parseMagnet } from "./sources/magnet";
import { magnetFromTorrentFile } from "./sources/torrentFile";
import { VERSION } from "./version";

const cmd = parseCliArgs(process.argv.slice(2));

if (cmd.kind === "help") {
  console.log(HELP_TEXT);
  process.exit(0);
}
if (cmd.kind === "version") {
  console.log(`torlink v${VERSION}`);
  process.exit(0);
}
if (cmd.kind === "invalid") {
  console.error(`error: unknown argument '${cmd.arg}'\n`);
  console.error(HELP_TEXT);
  process.exit(1);
}
if (cmd.kind !== "run") process.exit(1);

const lifecycle = new StartupLifecycle((code) => process.exit(code));
process.on("SIGINT", () => lifecycle.terminate(0));
process.on("SIGTERM", () => lifecycle.terminate(0));
process.on("uncaughtException", (error) => {
  console.error(error);
  lifecycle.fail(1);
});

async function start(command: Extract<CliCommand, { kind: "run" }>): Promise<void> {
  const core = await Core.boot();
  lifecycle.setCore(core);
  if (lifecycle.stopping) return;

  const launch = command.initialMagnet
    ? parseMagnet(command.initialMagnet)
    : command.initialTorrent
      ? await magnetFromTorrentFile(command.initialTorrent)
      : null;
  if (lifecycle.stopping) return;
  if (launch) {
    await core.startDownload({ id: launch.infoHash, name: launch.name, magnet: launch.magnet });
  }
  if (lifecycle.stopping) return;

  const webRoot = fileURLToPath(new URL("./web/", import.meta.url));
  const server = createTorlinkServer({
    core,
    webRoot,
    onQuit: () => lifecycle.terminate(0),
  });
  lifecycle.setServer(server);
  if (lifecycle.stopping) return;

  const port = parsePort(process.env.TORLINK_PORT);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  if (lifecycle.stopping) return;

  const addr = server.address();
  const actual = addr && typeof addr !== "string" ? addr.port : port;
  const url = `http://127.0.0.1:${actual}/`;
  console.log(`torlink v${VERSION}\n\n  ${url}\n\nCtrl+C to quit.`);
  if (!process.env.TORLINK_NO_OPEN) openBrowser(url);
}

void start(cmd).catch((error) => {
  console.error(error);
  lifecycle.fail(1);
});
