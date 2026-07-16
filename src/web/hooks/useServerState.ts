import { useEffect, useState } from "react";
import type { AppState } from "../../server/state";
import { apiUrl } from "../api";

export function useServerState(): { state: AppState | null; completed: string | null } {
  const [state, setState] = useState<AppState | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(apiUrl("/api/events"));
    es.addEventListener("state", (e) => {
      try {
        setState(JSON.parse((e as MessageEvent).data) as AppState);
      } catch {
        // Ignore malformed event data and keep the most recent valid state.
      }
    });
    es.addEventListener("completed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { name?: unknown };
        if (typeof data.name === "string") setCompleted(data.name);
      } catch {
        // Ignore malformed event data.
      }
    });
    return () => es.close();
  }, []);

  return { state, completed };
}
