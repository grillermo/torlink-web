import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % FRAMES.length), 80);
    return () => window.clearInterval(timer);
  }, []);

  return <span><span className="accent">{FRAMES[frame]}</span>{label ? <span className="dim">{` ${label}`}</span> : null}</span>;
}
