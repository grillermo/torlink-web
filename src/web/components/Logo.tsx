import { useEffect, useState } from "react";
import { LOGO_LINES, LOGO_WIDTH, SPROUT_CELLS } from "../logo";
import { SHEEN_TICK_MS, sheenCenter, sheenIntensity, sheenPeriod } from "../sheen";

function sheenTone(factor: number): string {
  if (factor < 0.15) return "logo-sheen-top";
  if (factor < 0.4) return "logo-sheen-bright";
  if (factor < 0.7) return "logo-sheen-accent";
  return "logo-sheen-shade";
}

export function Logo() {
  const rows = LOGO_LINES.length;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), SHEEN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const center = sheenCenter(tick, sheenPeriod(LOGO_WIDTH));

  return (
    <div className="col logo" aria-label="torlink">
      {LOGO_LINES.map((line, row) => {
        const textRow = Math.max(0, row - 1);
        const textRows = Math.max(1, rows - 1);
        const tY = textRow / (textRows - 1 || 1);
        const chars = [...line];
        const last = Math.max(1, chars.length - 1);

        return (
          <div className="logo-line" key={row}>
            {chars.map((character, index) => {
              if (character === " ") return <span key={index}> </span>;
              if (SPROUT_CELLS.has(`${row},${index}`)) return <span className="b good" key={index}>{character}</span>;
              const factor = (index / last + tY) / 2;
              const intensity = sheenIntensity(index, center);
              return <span className={`b ${sheenTone(factor * (1 - intensity))}`} key={index}>{character}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}
