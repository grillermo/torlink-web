interface SuspendableCore {
  suspend(): void;
}

interface ClosableServer {
  close(): unknown;
}

type Exit = (code: number) => void;

export function parsePort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 0;
}

export class StartupLifecycle {
  private core: SuspendableCore | undefined;
  private server: ClosableServer | undefined;
  private stopped = false;

  constructor(private readonly exit: Exit) {}

  get stopping(): boolean {
    return this.stopped;
  }

  setCore(core: SuspendableCore): void {
    if (this.stopped) return;
    this.core = core;
  }

  setServer(server: ClosableServer): void {
    if (this.stopped) return;
    this.server = server;
  }

  terminate(code = 0): void {
    this.cleanupAndExit(code);
  }

  fail(code = 1): void {
    this.cleanupAndExit(code);
  }

  private cleanupAndExit(code: number): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.core?.suspend();
    } catch {}
    try {
      this.server?.close();
    } catch {}
    this.exit(code);
  }
}
