import { fileURLToPath } from "node:url";
import { parseCliArgs, HELP_TEXT } from "./cli/args";
import { Core } from "./server/core";
import { createToken, createTorlinkServer } from "./server/http";
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

const core = await Core.boot();

const launch = cmd.initialMagnet
  ? parseMagnet(cmd.initialMagnet)
  : cmd.initialTorrent
    ? await magnetFromTorrentFile(cmd.initialTorrent)
    : null;
if (launch) {
  await core.startDownload({ id: launch.infoHash, name: launch.name, magnet: launch.magnet });
}

const token = process.env.TORLINK_TOKEN ?? createToken();
const webRoot = fileURLToPath(new URL("./web/", import.meta.url));

let quitting = false;
function quit(code = 0): void {
  if (quitting) process.exit(code);
  quitting = true;
  core.suspend();
  server.close();
  process.exit(code);
}

const server = createTorlinkServer({ core, token, webRoot, onQuit: () => quit(0) });
const port = Number(process.env.TORLINK_PORT) || 0;
server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const actual = addr && typeof addr !== "string" ? addr.port : port;
  const url = `http://127.0.0.1:${actual}/?token=${token}`;
  console.log(`torlink v${VERSION}\n\n  ${url}\n\nCtrl+C to quit.`);
  if (!process.env.TORLINK_NO_OPEN) openBrowser(url);
});

process.on("SIGINT", () => quit(0));
process.on("SIGTERM", () => quit(0));
process.on("uncaughtException", (err) => {
  console.error(err);
  quit(1);
});
