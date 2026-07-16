import { useEffect } from "react";
import { useStore } from "../store";

export function TabTitle() {
  const { state } = useStore();
  const active = state.queue.filter((item) => item.status === "downloading").length;

  useEffect(() => {
    document.title = active > 0 ? `↓${active} · torlink` : "torlink";
  }, [active]);

  return null;
}
