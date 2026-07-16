import { type CSSProperties, useEffect, useState } from "react";
import { COLOR } from "../../ui/theme";
import { SHEEN_TICK_MS, sheenCenter, sheenIntensity, sheenPeriod } from "../../ui/sheen";

function tone(color: string): string | undefined {
  if (color === COLOR.good) return "good";
  if (color === COLOR.warn) return "warn";
  if (color === COLOR.bad) return "bad";
  if (color === COLOR.accent) return "accent";
  return undefined;
}

function sheenClass(intensity: number): string {
  if (intensity >= 0.65) return "bar-sheen-peak";
  if (intensity > 0.3) return "bar-sheen-mid";
  return intensity > 0 ? "bar-sheen-low" : "";
}

export function ProgressBar({
  pct,
  width,
  color = COLOR.accent,
  animate = false,
}: {
  pct: number;
  width: number;
  color?: string;
  animate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), SHEEN_TICK_MS);
    return () => window.clearInterval(timer);
  }, [animate]);

  const center = sheenCenter(tick, sheenPeriod(width));
  const colorClass = tone(color);
  const customColorStyle = colorClass ? undefined : ({ "--bar-color": color } as CSSProperties);
  return (
    <span aria-label={`${clamped}%`}>
      {Array.from({ length: filled }, (_, index) => (
        <span
          className={`${colorClass ?? "bar-color-custom"} bar-cell ${animate ? sheenClass(sheenIntensity(index, center)) : ""}`}
          key={index}
          style={customColorStyle}
        >█</span>
      ))}
      {empty > 0 ? <span className="fg-rule">{"░".repeat(empty)}</span> : null}
    </span>
  );
}
