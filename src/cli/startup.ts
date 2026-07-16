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
  private shutdownCode: number | undefined;
  private cleaned = false;

  constructor(private readonly exit: Exit) {}

  get stopping(): boolean {
    return this.shutdownCode !== undefined;
  }

  setCore(core: SuspendableCore): void {
    this.core = core;
    if (this.shutdownCode !== undefined) this.cleanupAndExit(this.shutdownCode);
  }

  setServer(server: ClosableServer): void {
    this.server = server;
    if (this.shutdownCode !== undefined) this.cleanupAndExit(this.shutdownCode);
  }

  terminate(code = 0): void {
    if (this.shutdownCode !== undefined) {
      this.exit(code);
      return;
    }
    this.shutdownCode = code;
    if (this.core) this.cleanupAndExit(code);
  }

  fail(code = 1): void {
    this.shutdownCode = code;
    this.cleanupAndExit(code);
  }

  private cleanupAndExit(code: number): void {
    if (this.cleaned) {
      this.exit(code);
      return;
    }
    this.cleaned = true;
    try {
      this.core?.suspend();
    } catch {}
    try {
      this.server?.close();
    } catch {}
    this.exit(code);
  }
}
